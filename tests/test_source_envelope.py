"""Contract validation — fixtures are demonstrably NOT live captures."""
import json
import pathlib
import unittest

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError as exc:
    raise RuntimeError("Install jsonschema to validate AEGIS contract: python -m pip install jsonschema") from exc

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / "docs/contracts/source-envelope.v1.schema.json").read_text())
FIXTURE = json.loads((ROOT / "docs/contracts/examples/inamhi-warning83.fixture.json").read_text())
V = Draft202012Validator(SPEC, format_checker=FormatChecker())


class SourceContractTest(unittest.TestCase):
    def test_schema_valid(self):
        Draft202012Validator.check_schema(SPEC)

    def test_example_valid_and_never_published(self):
        self.assertEqual([], list(V.iter_errors(FIXTURE)))
        self.assertEqual(FIXTURE["recordOrigin"], "synthetic_fixture")
        self.assertEqual(FIXTURE["retrievedAt"], None)
        self.assertIsNone(FIXTURE["raw"]["sha256"])
        self.assertIn("NO ES UNA INGESTA REAL", FIXTURE["quality"]["blockers"])

    def test_cannot_pass_synthetic_as_capture(self):
        sample = json.loads(json.dumps(FIXTURE))
        sample["recordOrigin"] = "captured_source"
        self.assertNotEqual([], list(V.iter_errors(sample)))

    def test_synthetic_cannot_claim_validity(self):
        sample = json.loads(json.dumps(FIXTURE))
        sample["quality"]["dataStatus"] = "valid"
        self.assertNotEqual([], list(V.iter_errors(sample)))

    def test_utc_is_mandatory(self):
        sample = json.loads(json.dumps(FIXTURE))
        sample["time"]["issuedAt"] = "2026-10-25T14:00:00-05:00"
        self.assertNotEqual([], list(V.iter_errors(sample)))

    def test_bulletin_hours_and_source(self):
        self.assertEqual("2026-10-25T19:00:00Z", FIXTURE["time"]["issuedAt"])
        self.assertEqual("2026-10-25T21:00:00Z", FIXTURE["time"]["validFrom"])
        self.assertEqual("2026-10-29T04:00:00Z", FIXTURE["time"]["validTo"])
        self.assertEqual(83, FIXTURE["details"]["bulletinNumber"])


if __name__ == "__main__":
    unittest.main()
