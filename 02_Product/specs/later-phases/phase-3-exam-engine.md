# Phase 3 - Exam Engine

Status: PROPOSED (feature level) · To be re-specified in detail before starting
Prerequisite: Phase 1 live; official TEF Canada / TCF Canada formats re-confirmed from official sources at spec time.

## Goal
Serve the Canada Immigration learner end to end: know how ready they are for TEF/TCF Canada and close the gap
before test day. A separate, high-value revenue line.

## Features
| # | Feature | Summary |
|---|---|---|
| 3.1 | Exam-specific roadmaps | Roadmap keyed to the learner's booked test date and the target NCLC per skill; final 4 weeks switch to exam mode (timed practice, strategy) |
| 3.2 | Exam-style question bank | Original items modelled on the published format of each section (never copied from official materials). Human-reviewed |
| 3.3 | Timed section practice | Listening, reading, writing, speaking under exam timing |
| 3.4 | Full mock exams | Complete timed simulation; writing and speaking marked by an AI examiner with rubric; results per section |
| 3.5 | Readiness estimate | Estimated NCLC per skill and overall readiness %; always "Estimate - not an official score"; calibrated against learners who report real results |
| 3.6 | Mock result -> roadmap | Weakness analysis updates the roadmap immediately ("Your roadmap has been updated") |
| 3.7 | Exam packages (one-time) | Proposed: Starter $29, Accelerator $79, Intensive $149, Exam + Tutor $249+ - validate against competitor pricing first |
| 3.8 | Tutor exam reviews | Tutors with TEF/TCF specialty review mock writing/speaking for a fee |
| 3.9 | Real-result reporting | Learners report actual scores; used to calibrate the estimate and as social proof (with consent) |

## Data additions
exam_type, exam_section, exam_item, mock_exam, mock_attempt, section_result, readiness_snapshot, exam_package_purchase,
reported_official_result.

## Risks
- Copyright: all items must be original.
- Calibration: readiness estimates need real-result data; show wide confidence until enough exists.
- Legal wording: never imply a guaranteed score or immigration outcome.
