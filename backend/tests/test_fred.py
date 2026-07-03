"""FRED payload parsing tests (no network)."""
from app.services.fred import observations_to_df


def test_observations_parse_missing_values():
    payload = {
        "observations": [
            {"date": "2026-01-01", "value": "123.4"},
            {"date": "2026-02-01", "value": "."},  # FRED's missing marker
            {"date": "2026-03-01", "value": "125.0"},
        ]
    }
    df = observations_to_df(payload)
    assert list(df.columns) == ["date", "value"]
    assert len(df) == 3
    assert df["value"].isna().sum() == 1
    assert df["value"].iloc[0] == 123.4
    assert str(df["date"].iloc[0].date()) == "2026-01-01"


def test_empty_payload_gives_typed_empty_frame():
    df = observations_to_df({})
    assert list(df.columns) == ["date", "value"]
    assert df.empty
