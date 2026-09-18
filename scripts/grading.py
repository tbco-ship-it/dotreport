"""Independent screening index v2.0.0. Mirror: static/grade.js.

Unknown is not a pass. No inference of active authority/insurance or complete
SMS alerts is made. See docs/2026-09-18-data-integrity.md for evidence and limits.
"""
import math

MIN_INSP = 5
VERSION = "2.0.0"


def rnd(x, nd):
    return math.floor(x * 10 ** nd + 0.5) / 10 ** nd


def number(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def valid_rate(rate, count):
    return number(count) and count >= MIN_INSP and number(rate) and 0 <= rate <= 100


def grade(c, nat):
    score, factors, missing = 100, [], []

    def add(key, label, points, note):
        nonlocal score
        score += points
        factors.append(dict(key=key, label=label, points=points, note=note))

    for key, label, multiple in [("driver", "Driver", 2), ("vehicle", "Vehicle", 1.5)]:
        r, n, count = c.get(key + "_oos_rate"), nat.get(key + "_oos_rate"), c.get(key + "_insp")
        valid = valid_rate(r, count) and number(n) and 0 < n <= 100
        if valid:
            points = -25 if r >= multiple * n else -10 if r > n else 0
            note = f"{r:.1f}% vs {n:.2f}% benchmark; {count} inspections"
        else:
            points, note = 0, "Unavailable or fewer than 5 category inspections; not a passing result"
            missing.append(key + "_inspections_or_benchmark")
        add(key + "_oos", label + " out-of-service rate", points, note)

    add("basics", "Public SMS indicators", 0,
        "Informational only; public investigation flags are not complete BASIC alerts")
    cr = c.get("crashes") or {}
    # v1 fatal/injury are sums of people, NOT counts of fatal/injury crashes.
    deaths = cr.get("fatalities", cr.get("fatal"))
    total, pu = cr.get("total"), c.get("pu")
    if not (number(total) and total >= 0 and number(deaths) and deaths >= 0 and number(pu) and pu > 0):
        missing.append("crash_counts_or_fleet")
        add("crashes", "Crash involvement and fatalities", 0, "Insufficient crash or fleet data; not a zero-crash result")
    else:
        per100 = rnd(100 * total / pu, 1)
        deaths100 = rnd(100 * deaths / pu, 2)
        # Retains the previous numerical mortality threshold, now named correctly.
        points = -20 if deaths > 0 and deaths100 >= 0.5 else -15 if per100 > 8 else -5 if per100 > 4 else 0
        add("crashes", "Crash involvement and fatalities", points,
            f"{total} crash records; {deaths} fatalities (people); {per100:.1f} records and {deaths100:.2f} fatalities per 100 power units; fault not determined")

    status = c.get("status")
    if status not in ("A", "I"):
        missing.append("registration_status")
    add("registration", "USDOT registration", -40 if status == "I" else 0,
        "Inactive in census extract; verify official record" if status == "I" else
        "Active in census extract; not proof of for-hire authority" if status == "A" else "Registration status unconfirmed")
    add("authority", "Operating authority", 0, "Not verified; a USDOT status or MC docket is not a current authority check")
    add("insurance", "Liability insurance", 0, "Not verified; historical filings or missing extract rows do not establish current coverage")

    limited = bool(missing)
    score = max(0, min(100, score))
    letter = "NR" if limited else "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D" if score >= 40 else "F"
    return dict(score=None if limited else score, letter=letter, limited=limited,
                missing=missing, version=VERSION, factors=factors)
