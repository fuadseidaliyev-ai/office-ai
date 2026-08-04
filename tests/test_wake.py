"""Tests for wake-word detection."""

from __future__ import annotations

import pytest

from voice_assistant.wake import WakeDetector

WAKE = "привет джарвис"


@pytest.fixture
def detector():
    return WakeDetector(WAKE)


# ------------------------------------------------------------- activation ---
@pytest.mark.parametrize(
    "utterance",
    [
        "привет джарвис",
        "Привет, Джарвис!",
        "джарвис",
        "эй, джарвис",
        "привет жарвис",      # common STT mishearing
        "hey jarvis",
        "окей джарвес",
    ],
)
def test_wakes_on_name(detector, utterance):
    woken, command = detector.detect(utterance)
    assert woken is True
    assert command == ""  # no trailing command


@pytest.mark.parametrize(
    "utterance",
    ["как дела", "привет мир", "открой папку", "", "привет"],
)
def test_stays_dormant_without_name(detector, utterance):
    woken, command = detector.detect(utterance)
    assert woken is False
    assert command == ""


# ----------------------------------------------------- trailing command ----
def test_extracts_trailing_command(detector):
    woken, command = detector.detect("привет джарвис открой папку загрузки")
    assert woken is True
    assert command == "открой папку загрузки"


def test_extracts_command_name_only_prefix(detector):
    woken, command = detector.detect("джарвис, сколько сейчас времени?")
    assert woken is True
    assert command == "сколько сейчас времени"


def test_english_trailing_command(detector):
    woken, command = detector.detect("hey jarvis what time is it")
    assert woken is True
    assert command == "what time is it"


# ------------------------------------------------------- config behavior ----
def test_custom_wake_word():
    d = WakeDetector("компьютер")
    assert d.detect("компьютер выключи музыку") == (True, "выключи музыку")
    # Jarvis variants still work as a built-in fallback name set
    assert d.detect("джарвис привет")[0] is True


def test_name_is_last_token():
    assert WakeDetector("привет джарвис").name == "джарвис"
    assert WakeDetector("окей компьютер").name == "компьютер"
