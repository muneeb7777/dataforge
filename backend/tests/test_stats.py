"""Stats service tests on synthetic data (forecast excluded: prophet is slow)."""
import pytest

from app.services import stats


def test_correlation_perfect_and_diagonal(seed):
    seed("CREATE TABLE c AS SELECT n AS x, 2 * n AS y FROM range(10) t(n)")
    result = stats.correlation("c", None, "pearson")
    assert result["columns"] == ["x", "y"]
    assert result["matrix"][0][0] == pytest.approx(1.0)
    assert result["matrix"][0][1] == pytest.approx(1.0)  # y = 2x → r = 1


def test_correlation_needs_two_numeric(seed):
    seed("CREATE TABLE one AS SELECT 1 AS a")
    with pytest.raises(stats.StatsError, match="at least two numeric"):
        stats.correlation("one", None, "pearson")


def test_ttest_two_groups(seed):
    seed(
        "CREATE TABLE t AS SELECT CASE WHEN n < 10 THEN 'a' ELSE 'b' END AS g, "
        "CASE WHEN n < 10 THEN n ELSE n + 100 END::DOUBLE AS v FROM range(20) t(n)"
    )
    result = stats.ttest("t", "v", "g")
    assert {result["group_a"], result["group_b"]} == {"a", "b"}
    assert result["n_a"] == result["n_b"] == 10
    assert result["p_value"] < 0.001  # groups differ by ~100


def test_ttest_rejects_wrong_group_count(seed):
    seed("CREATE TABLE t3 AS SELECT n % 3 AS g, n::DOUBLE AS v FROM range(9) t(n)")
    with pytest.raises(stats.StatsError, match="exactly 2 distinct values"):
        stats.ttest("t3", "v", "g")


def test_chi2_contingency(seed):
    seed(
        "CREATE TABLE x2 AS SELECT CASE WHEN n % 2 = 0 THEN 'e' ELSE 'o' END AS a, "
        "CASE WHEN n % 4 < 2 THEN 'lo' ELSE 'hi' END AS b FROM range(40) t(n)"
    )
    result = stats.chi2("x2", "a", "b")
    assert result["dof"] == 1
    assert sum(sum(row) for row in result["observed"]) == 40


def test_regression_recovers_slope(seed):
    seed("CREATE TABLE r AS SELECT n::DOUBLE AS x, (3 * n + 5)::DOUBLE AS y FROM range(30) t(n)")
    result = stats.regression("r", "y", ["x"])
    coefs = {c["name"]: c["coef"] for c in result["coefficients"]}
    assert coefs["x"] == pytest.approx(3.0)
    assert coefs["const"] == pytest.approx(5.0)
    assert result["r2"] == pytest.approx(1.0)


def test_regression_target_not_a_feature(seed):
    seed("CREATE TABLE r2 AS SELECT n::DOUBLE AS x FROM range(5) t(n)")
    with pytest.raises(stats.StatsError, match="cannot also be a feature"):
        stats.regression("r2", "x", ["x"])
