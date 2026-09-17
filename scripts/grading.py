"""DOT Report Card grade from public FMCSA data. Mirrored 1:1 in static/grade.js — change both, then run scripts/test_grade.mjs."""

import math

MIN_INSP = 5  # fewer inspections than this in a category -> that factor is "not enough data", no deduction


def rnd(x, nd):
    """Half-up rounding, same as JS Math.round — Python's round() is half-to-even."""
    m = 10 ** nd
    return math.floor(x * m + 0.5) / m


def grade(c, nat):
    """c: normalized carrier record, nat: {"driver_oos_rate", "vehicle_oos_rate"} national averages (percent)."""
    score, factors = 100, []

    def add(key, label, points, note):
        nonlocal score
        score += points
        factors.append({"key": key, "label": label, "points": points, "note": note})

    if c["driver_insp"] >= MIN_INSP and c["driver_oos_rate"] is not None:
        r, n = c["driver_oos_rate"], nat["driver_oos_rate"]
        if r >= 2 * n:
            add("driver_oos", "Driver out-of-service rate", -25, f"{r}% vs {n}% national — more than double")
        elif r > n:
            add("driver_oos", "Driver out-of-service rate", -10, f"{r}% vs {n}% national — above average")
        else:
            add("driver_oos", "Driver out-of-service rate", 0, f"{r}% vs {n}% national — at or below average")
    else:
        add("driver_oos", "Driver out-of-service rate", 0, "not enough inspections to judge")

    if c["vehicle_insp"] >= MIN_INSP and c["vehicle_oos_rate"] is not None:
        r, n = c["vehicle_oos_rate"], nat["vehicle_oos_rate"]
        if r >= 1.5 * n:
            add("vehicle_oos", "Vehicle out-of-service rate", -25, f"{r}% vs {n}% national — 1.5× or worse")
        elif r > n:
            add("vehicle_oos", "Vehicle out-of-service rate", -10, f"{r}% vs {n}% national — above average")
        else:
            add("vehicle_oos", "Vehicle out-of-service rate", 0, f"{r}% vs {n}% national — at or below average")
    else:
        add("vehicle_oos", "Vehicle out-of-service rate", 0, "not enough inspections to judge")

    alerts = [b["label"] for b in c["basics"] if b["alert"]]
    add("basics", "BASIC alerts", -15 * len(alerts), (", ".join(alerts) if alerts else "no BASIC alert flags in the public SMS file"))

    cr = c["crashes"]
    per100 = rnd(100 * cr["total"] / c["pu"], 1) if c["pu"] else None
    fatal100 = rnd(100 * cr["fatal"] / c["pu"], 2) if c["pu"] else None
    if cr["fatal"] and (fatal100 is None or fatal100 >= 0.5):
        add("crashes", "Crashes (24 months)", -20, f"{cr['total']} reported, {cr['fatal']} fatal" + (f" = {fatal100} fatal per 100 power units" if fatal100 is not None else ""))
    else:
        note = f"{cr['total']} reported" + (f", {cr['fatal']} fatal" if cr["fatal"] else "") + (f" = {per100} per 100 power units" if per100 is not None and cr["total"] else "")
        add("crashes", "Crashes (24 months)", -15 if per100 is not None and per100 > 8 else -5 if per100 is not None and per100 > 4 else 0, note)

    if c.get("status") and c.get("status") != "A":
        add("authority", "Registration status", -40, "USDOT number is inactive — the carrier may not operate")
    elif c.get("mc") and c.get("mc_status") != "A":
        add("authority", "Operating authority", -20, f"{c['mc']} is not active")
    else:
        add("authority", "Operating authority", 0, f"{c['mc']} active" if c.get("mc") else "no MC docket on file (private / exempt carrier)")

    # informational only: FMCSA's open-data insurance extract covers a fraction of carriers, so absence is not evidence of a lapse
    liab = [i for i in c["insurance"] if i["type"] == "Liability (BIPD)"]
    add("insurance", "Liability insurance filing", 0, f"${liab[0]['amount']:,.0f} with {liab[0]['company']}" if liab else "not in the open-data extract — verify on FMCSA L&I")

    score = max(0, min(100, score))
    letter = "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D" if score >= 40 else "F"
    limited = c["insp"] < MIN_INSP
    return {"score": score, "letter": letter, "limited": limited, "factors": factors}
