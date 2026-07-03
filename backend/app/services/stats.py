"""Statistics / ML over DuckDB tables via pandas + scipy/statsmodels/prophet.

Data is pulled column-wise into pandas (fine at this scale); every column name
is validated against the table schema before it reaches SQL.
"""
import logging
import math

import duckdb
import pandas as pd
from scipy import stats as scipy_stats

from app.services.ingestion import _db_file, _duck_lock, _qident
from app.services.profiling import _is_numeric

logging.getLogger("cmdstanpy").setLevel(logging.WARNING)  # prophet's backend is chatty

MAX_CONTINGENCY_LEVELS = 50


class StatsError(ValueError):
    pass


def _f(value) -> float:
    """float() with NaN/inf → None safety for JSON."""
    v = float(value)
    return None if (math.isnan(v) or math.isinf(v)) else v


def _schema(con, table: str) -> dict[str, str]:
    return {d[0]: d[1] for d in con.execute(f"DESCRIBE {_qident(table)}").fetchall()}


def _fetch_df(table: str, columns: list[str]) -> pd.DataFrame:
    with _duck_lock, duckdb.connect(_db_file(), read_only=True) as con:
        schema = _schema(con, table)
        for col in columns:
            if col not in schema:
                raise StatsError(f"Unknown column: {col!r}")
        cols = ", ".join(_qident(c) for c in columns)
        return con.execute(f"SELECT {cols} FROM {_qident(table)}").df()


def numeric_columns(table: str) -> list[str]:
    with _duck_lock, duckdb.connect(_db_file(), read_only=True) as con:
        return [name for name, dtype in _schema(con, table).items() if _is_numeric(dtype)]


def correlation(table: str, columns: list[str] | None, method: str) -> dict:
    cols = columns or numeric_columns(table)
    if len(cols) < 2:
        raise StatsError("Need at least two numeric columns for a correlation matrix")
    df = _fetch_df(table, cols)
    non_numeric = [c for c in cols if not pd.api.types.is_numeric_dtype(df[c])]
    if non_numeric:
        raise StatsError(f"Non-numeric columns: {', '.join(non_numeric)}")
    corr = df.corr(method=method)
    matrix = [[_f(corr.iloc[i, j]) for j in range(len(cols))] for i in range(len(cols))]
    return {"columns": cols, "matrix": matrix}


def ttest(table: str, value_column: str, group_column: str) -> dict:
    df = _fetch_df(table, [value_column, group_column]).dropna()
    if not pd.api.types.is_numeric_dtype(df[value_column]):
        raise StatsError(f"{value_column!r} is not numeric")
    groups = sorted(df[group_column].astype(str).unique())
    if len(groups) != 2:
        raise StatsError(
            f"{group_column!r} must have exactly 2 distinct values, found {len(groups)}"
        )
    a = df.loc[df[group_column].astype(str) == groups[0], value_column]
    b = df.loc[df[group_column].astype(str) == groups[1], value_column]
    if len(a) < 2 or len(b) < 2:
        raise StatsError("Each group needs at least 2 observations")
    t_stat, p_value = scipy_stats.ttest_ind(a, b, equal_var=False)  # Welch
    return {
        "group_a": groups[0],
        "group_b": groups[1],
        "n_a": int(len(a)),
        "n_b": int(len(b)),
        "mean_a": _f(a.mean()),
        "mean_b": _f(b.mean()),
        "t_stat": _f(t_stat),
        "p_value": _f(p_value),
    }


def chi2(table: str, column_a: str, column_b: str) -> dict:
    df = _fetch_df(table, [column_a, column_b]).dropna()
    if df.empty:
        raise StatsError("No rows with both columns present")
    table_ab = pd.crosstab(df[column_a].astype(str), df[column_b].astype(str))
    if table_ab.shape[0] > MAX_CONTINGENCY_LEVELS or table_ab.shape[1] > MAX_CONTINGENCY_LEVELS:
        raise StatsError(
            f"Too many categories (max {MAX_CONTINGENCY_LEVELS} per column) — "
            "pick lower-cardinality columns"
        )
    if table_ab.shape[0] < 2 or table_ab.shape[1] < 2:
        raise StatsError("Both columns need at least 2 distinct values")
    chi2_stat, p_value, dof, _ = scipy_stats.chi2_contingency(table_ab)
    return {
        "chi2": _f(chi2_stat),
        "p_value": _f(p_value),
        "dof": int(dof),
        "row_labels": [str(v) for v in table_ab.index],
        "col_labels": [str(v) for v in table_ab.columns],
        "observed": table_ab.values.astype(int).tolist(),
    }


def regression(table: str, target: str, features: list[str]) -> dict:
    import statsmodels.api as sm

    if target in features:
        raise StatsError("Target cannot also be a feature")
    df = _fetch_df(table, [target, *features]).dropna()
    for col in (target, *features):
        if not pd.api.types.is_numeric_dtype(df[col]):
            raise StatsError(f"{col!r} is not numeric")
    if len(df) < len(features) + 2:
        raise StatsError(f"Not enough rows ({len(df)}) for {len(features)} features")
    X = sm.add_constant(df[list(features)].astype(float))
    model = sm.OLS(df[target].astype(float), X).fit()
    coefficients = [
        {
            "name": name,
            "coef": _f(model.params[name]),
            "std_err": _f(model.bse[name]),
            "t_stat": _f(model.tvalues[name]),
            "p_value": _f(model.pvalues[name]),
        }
        for name in X.columns
    ]
    return {
        "coefficients": coefficients,
        "r2": _f(model.rsquared),
        "adj_r2": _f(model.rsquared_adj),
        "n_obs": int(model.nobs),
    }


def forecast(
    table: str, date_column: str, value_column: str, periods: int, freq: str, agg: str
) -> dict:
    from prophet import Prophet  # heavy import, deferred to first use

    df = _fetch_df(table, [date_column, value_column]).dropna()
    if not pd.api.types.is_numeric_dtype(df[value_column]):
        raise StatsError(f"{value_column!r} is not numeric")
    df["ds"] = pd.to_datetime(df[date_column], errors="coerce")
    df = df.dropna(subset=["ds"])
    if df.empty:
        raise StatsError(f"{date_column!r} has no parseable dates")
    series = (
        df.groupby("ds")[value_column].agg(agg).reset_index().rename(columns={value_column: "y"})
    )
    if len(series) < 5:
        raise StatsError(f"Need at least 5 distinct dates, found {len(series)}")

    model = Prophet()
    model.fit(series)
    future = model.make_future_dataframe(periods=periods, freq=freq)
    predicted = model.predict(future)

    history = [
        {"ds": ds.date().isoformat(), "y": _f(y)} for ds, y in zip(series["ds"], series["y"])
    ]
    forecast_rows = [
        {
            "ds": row.ds.date().isoformat(),
            "yhat": _f(row.yhat),
            "yhat_lower": _f(row.yhat_lower),
            "yhat_upper": _f(row.yhat_upper),
        }
        for row in predicted.itertuples()
    ]
    return {"history": history, "forecast": forecast_rows}
