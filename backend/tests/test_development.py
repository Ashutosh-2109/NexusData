import unittest
from engine.development import score_city, suggestions, scenario


def rows(pm25=40, temperature=36, count=48):
    return [{"time": f"2026-01-01T{i:02d}:00Z", "metrics": {"pm25": pm25 + i / 10,
        "temperature": temperature + i / 20, "pm10": 80 + i, "no2": 50 + i / 10,
        "load_MW": 1000 + i * 20, "aqi": 120 + i}} for i in range(count)]


class DevelopmentTests(unittest.TestCase):
    def test_score_and_rule_evidence(self):
        city = {"name": "Test", "population": 1000000, "area_km2": 100}
        history = rows()
        peers = [{"current": {"metrics": {"aqi": 120}}}, {"current": {"metrics": {"aqi": 140}}}]
        score = score_city(city, history, peers)
        self.assertGreater(score["score"], 0)
        self.assertIn("Air Quality", [area["area"] for area in score["focus_areas"]])
        recs = suggestions(score, history, [])
        self.assertTrue(recs)
        self.assertIn("PM2.5", recs[0]["evidence"][0])
        self.assertTrue(all(rec["limitations"] for rec in recs))

    def test_scenario_math(self):
        result = scenario(rows(), "temperature", "load_MW", -10)
        self.assertLess(result["projected_target"], result["baseline_target"])
        self.assertEqual(result["sample_count"], 48)
        self.assertIn("not causal", result["label"])
        with self.assertRaises(ValueError):
            scenario(rows(count=5), "temperature", "load_MW", 10)


if __name__ == "__main__":
    unittest.main()
