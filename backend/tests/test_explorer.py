"""Explorer (read-only SQL) gating and execution tests."""
import pytest

from app.services import explorer


@pytest.fixture()
def table(seed):
    seed("CREATE TABLE nums AS SELECT * FROM (VALUES (1), (2), (3)) t(n)")


def test_select_runs(table):
    result = explorer.run_query("SELECT SUM(n) AS total FROM nums")
    assert result["rows"] == [{"total": 6}]
    assert result["truncated"] is False
    assert result["columns"][0]["name"] == "total"


def test_trailing_semicolon_is_tolerated(table):
    assert explorer.run_query("SELECT 1 AS x;")["rows"] == [{"x": 1}]


def test_truncation_flag(table):
    result = explorer.run_query("SELECT n FROM nums", max_rows=2)
    assert result["row_count"] == 2
    assert result["truncated"] is True


@pytest.mark.parametrize(
    "bad",
    [
        "INSERT INTO nums VALUES (4)",
        "DROP TABLE nums",
        "UPDATE nums SET n = 0",
        "SELECT 1; SELECT 2",
        "   ",
    ],
)
def test_non_read_statements_rejected(table, bad):
    with pytest.raises(explorer.QueryRejected):
        explorer.run_query(bad)
