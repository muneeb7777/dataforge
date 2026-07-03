"""add pipeline provenance columns to datasets

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("datasets", sa.Column("source_dataset_id", sa.Integer(), nullable=True))
    op.add_column(
        "datasets",
        sa.Column("pipeline", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_datasets_source_dataset_id_datasets"),
        "datasets",
        "datasets",
        ["source_dataset_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_datasets_source_dataset_id_datasets"), "datasets", type_="foreignkey"
    )
    op.drop_column("datasets", "pipeline")
    op.drop_column("datasets", "source_dataset_id")
