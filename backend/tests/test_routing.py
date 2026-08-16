"""
Intent-routing regression tests — run with:  pytest backend/tests -q

These test the deterministic layer only (no LLM calls), which is where
historically all the bugs came from (fuzzy matching, entity detection).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

import timetable_service as tt
from pipeline import route, get_session, answer_question, SessionMemory


def fresh_memory():
    return SessionMemory()


# ── Intent routing ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("question,expected_intent", [
    # timetable
    ("What are BCS-1 classes on Monday?", "timetable"),
    ("show me BSSE-3 timetable for the whole week", "timetable"),
    ("BS(CS)-I schedule today", "timetable"),
    ("next class of cs 1", "timetable"),
    # teacher
    ("Is Sir Kamran free on Friday?", "teacher"),
    ("who teaches Data Structures?", "teacher"),
    ("show schedule of Mr. Usman Anwar", "teacher"),
    ("is dr sardaraz busy on monday", "teacher"),
    # room
    ("Is LT 4 free on Monday?", "room"),
    ("when is CR 2 free this week", "room"),
    # rooms overview
    ("which rooms are free on friday morning?", "rooms_all"),
    ("show all rooms availability", "rooms_all"),
    # comsats info
    ("tell me about COMSATS campuses", "comsats_info"),
    ("how do I apply for admission at COMSATS?", "comsats_info"),
    # off topic
    ("tell me a joke about cats", "off_topic"),
    ("write a poem about love", "off_topic"),
])
def test_intent_routing(question, expected_intent):
    assert route(question, fresh_memory()).intent == expected_intent


# ── Entity detection ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("text,expected", [
    ("CS-I", "BS(CS)-I"),
    ("BCS-1", "BS(CS)-I"),
    ("BSSE-3", "BS(SE)-III"),
    ("cs 1", "BS(CS)-I"),
])
def test_class_detection(text, expected):
    assert tt.detect_class(text) == expected


def test_teacher_detection_with_typos():
    assert tt.detect_teacher("is sir kamran free") == "Mr. Kamran Ali"


def test_room_normalization():
    assert tt.detect_room("is lt4 free") is not None
    assert tt.detect_room("lecture theater 4 schedule") is not None


# ── Regression: bugs fixed during refactor ───────────────────────────────────

def test_class_query_not_hijacked_by_fuzzy_teacher():
    """'What are BCS-1 classes on Monday?' must be a timetable query,
    not a teacher query (fuzzy matcher used to grab 'Ms. Areeba')."""
    rq = route("What are BCS-1 classes on Monday?", fresh_memory())
    assert rq.intent == "timetable"
    assert rq.cls == "BS(CS)-I"


def test_explicit_teacher_with_class_still_teacher():
    """When user names a teacher explicitly, teacher intent wins even
    if a class is also mentioned."""
    rq = route("does sir kamran teach BCS-1?", fresh_memory())
    assert rq.intent == "teacher"


# ── Memory follow-ups ────────────────────────────────────────────────────────

def test_followup_reuses_last_teacher():
    session = "test-followup-1"
    get_session(session).__init__()  # reset
    r1 = answer_question("Is Sir Kamran free on Friday?", session_id=session)
    assert r1["intent"] == "teacher"
    r2 = answer_question("what about Tuesday?", session_id=session)
    assert r2["intent"] == "teacher"
    assert r2["answer"]["teacher"] == r1["answer"]["teacher"]
    assert r2["answer"]["days"][0]["day"] == "Tuesday"


def test_followup_reuses_last_class():
    session = "test-followup-2"
    get_session(session).__init__()
    r1 = answer_question("show BCS-1 classes on monday", session_id=session)
    assert r1["intent"] == "timetable"
    r2 = answer_question("and tuesday?", session_id=session)
    assert r2["intent"] == "timetable"


# ── Deterministic handlers return the shapes the frontend expects ────────────

def test_schedule_shape():
    r = answer_question("BCS-1 monday classes", session_id="shape-1")
    a = r["answer"]
    assert a["type"] == "schedule"
    assert {"subject", "teacher", "room", "time", "day"} <= set(a["classes"][0].keys())


def test_teacher_availability_shape():
    r = answer_question("is sir kamran free on friday", session_id="shape-2")
    a = r["answer"]
    assert a["type"] == "teacher_availability"
    assert {"day", "free", "busy"} <= set(a["days"][0].keys())


def test_room_availability_shape():
    r = answer_question("is LT 4 free on monday", session_id="shape-3")
    a = r["answer"]
    assert a["type"] == "room_availability"
    assert a["room"].startswith("LT")


def test_no_class_mentioned_asks_for_class():
    r = answer_question("what classes are on monday", session_id="shape-4")
    assert isinstance(r["answer"], str)
    assert "class name" in r["answer"].lower()
