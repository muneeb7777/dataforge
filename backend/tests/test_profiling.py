"""Profiling service tests: nulls, histograms, top values, constant columns."""
from app.services import profiling


def test_profile_mixed_table(seed):
    seed(
        """
        CREATE TABLE p AS SELECT * FROM (VALUES
            (1, 10.5, 'a', 7),
            (2, NULL,  'b', 7),
            (3, 8.1,  NULL, 7),
            (4, NULL,  'a', 7),
            (5, 12.0, 'a', 7)
        ) t(id, score, category, constant)
        """
    )
    profile = profiling.profile_table("p")
    assert profile["row_count"] == 5
    by_name = {c["name"]: c for c in profile["columns"]}

    score = by_name["score"]
    assert score["null_count"] == 2
    assert score["null_pct"] == 40.0
    assert score["histogram"] is not None and len(score["histogram"]) == profiling.HISTOGRAM_BINS
    assert sum(b["count"] for b in score["histogram"]) == 3  # non-null values only

    category = by_name["category"]
    assert category["histogram"] is None
    top = {t["value"]: t["count"] for t in category["top_values"]}
    assert top == {"a": 3, "b": 1}

    constant = by_name["constant"]  # hi == lo → single-bin path
    assert constant["histogram"] == [{"lo": 7.0, "hi": 7.0, "count": 5}]
