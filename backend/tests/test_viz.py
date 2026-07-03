"""Chart-data query builder tests."""
import pytest

from app.services import viz


@pytest.fixture()
def sales(seed):
    seed(
        """
        CREATE TABLE sales AS SELECT * FROM (VALUES
            ('N', 'w', 2), ('N', 'g', 3), ('S', 'w', 5), (NULL, 'w', 9)
        ) t(region, product, qty)
        """
    )


def test_grouped_sum_with_series(sales):
    result = viz.chart_data("sales", "region", "qty", "sum", "product", 100)
    rows = {(r["x"], r["series"]): r["y"] for r in result["rows"]}
    assert rows == {("N", "w"): 2, ("N", "g"): 3, ("S", "w"): 5}  # NULL x filtered out


def test_count_needs_no_y(sales):
    result = viz.chart_data("sales", "region", None, "count", None, 100)
    assert {(r["x"], r["y"]) for r in result["rows"]} == {("N", 2), ("S", 1)}


def test_raw_mode_requires_y(sales):
    with pytest.raises(viz.VizError, match="y column is required"):
        viz.chart_data("sales", "region", None, "none", None, 100)


def test_unknown_column_rejected(sales):
    with pytest.raises(viz.VizError, match="Unknown series column"):
        viz.chart_data("sales", "region", "qty", "sum", "bogus", 100)


def test_truncation(sales):
    result = viz.chart_data("sales", "product", "qty", "none", None, 1)
    assert result["truncated"] is True
    assert len(result["rows"]) == 1
