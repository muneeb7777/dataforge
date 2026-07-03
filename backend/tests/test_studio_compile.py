"""Pure compile tests for the studio pipeline → SQL translation."""
import pytest
from pydantic import ValidationError

from app.schemas.studio import (
    DeriveStep,
    FilterStep,
    JoinKey,
    JoinStep,
    RenameStep,
    SelectStep,
    SortKey,
    SortStep,
)
from app.services.studio import PipelineError, compile_pipeline


def test_empty_pipeline_is_source_scan():
    sql = compile_pipeline("ds_1", [], {})
    assert 's0 AS (SELECT * FROM "ds_1")' in sql
    assert sql.endswith("SELECT * FROM s0")


def test_each_step_becomes_a_cte():
    steps = [
        FilterStep(type="filter", condition="quantity > 5"),
        DeriveStep(type="derive", column="rev", expression="quantity * price"),
        SelectStep(type="select", columns=["rev"]),
    ]
    sql = compile_pipeline("ds_1", steps, {})
    assert "s1 AS (SELECT * FROM s0 WHERE quantity > 5)" in sql
    assert 's2 AS (SELECT *, (quantity * price) AS "rev" FROM s1)' in sql
    assert 's3 AS (SELECT "rev" FROM s2)' in sql
    assert sql.endswith("SELECT * FROM s3")


def test_rename_compiles_to_exclude_plus_alias():
    # duckdb 1.1 has no `* RENAME`; the EXCLUDE form must be used instead.
    sql = compile_pipeline("t", [RenameStep(type="rename", mapping={"old": "new"})], {})
    assert 'SELECT * EXCLUDE ("old"), "old" AS "new" FROM s0' in sql
    assert "RENAME (" not in sql


def test_final_sort_is_restated_on_outer_query():
    steps = [SortStep(type="sort", by=[SortKey(column="a", desc=True)])]
    sql = compile_pipeline("t", steps, {})
    assert sql.endswith('SELECT * FROM s1 ORDER BY "a" DESC')


def test_join_resolves_table_and_quotes_keys():
    steps = [
        JoinStep(type="join", dataset_id=7, how="left", on=[JoinKey(left="a", right="b")])
    ]
    sql = compile_pipeline("t", steps, {7: "ds_7"})
    assert 'LEFT JOIN "ds_7" AS r ON l."a" = r."b"' in sql


def test_join_unknown_dataset_raises():
    steps = [JoinStep(type="join", dataset_id=99, on=[JoinKey(left="a", right="b")])]
    with pytest.raises(PipelineError, match="unknown dataset 99"):
        compile_pipeline("t", steps, {})


def test_identifiers_with_quotes_are_escaped():
    sql = compile_pipeline("t", [SelectStep(type="select", columns=['we"ird'])], {})
    assert '"we""ird"' in sql


@pytest.mark.parametrize("bad", ["1=1; DROP TABLE x", "a > 1 -- comment", "b /* c */"])
def test_statement_breaking_fragments_rejected(bad):
    with pytest.raises(ValidationError):
        FilterStep(type="filter", condition=bad)
    with pytest.raises(ValidationError):
        DeriveStep(type="derive", column="c", expression=bad)
