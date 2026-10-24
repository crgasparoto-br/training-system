BEGIN;

INSERT INTO "Contract" ("id", "type", "document", "name", "createdAt", "updatedAt")
VALUES ('issue399-legacy-contract', 'personal', 'issue399-legacy-document', 'Issue 399 legacy contract', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "CollaboratorFunctionOption" ("id", "contractId", "name", "code", "isActive", "isSystem", "createdAt", "updatedAt")
VALUES ('issue399-legacy-function', 'issue399-legacy-contract', 'Professor', 'professor', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "User" ("id", "email", "passwordHash", "type", "createdAt", "updatedAt")
VALUES ('issue399-legacy-professor-user', 'issue399-legacy-professor@example.invalid', 'not-a-real-password', 'professor', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Professor" ("id", "userId", "contractId", "role", "collaboratorFunctionId", "createdAt", "updatedAt")
VALUES ('issue399-legacy-professor', 'issue399-legacy-professor-user', 'issue399-legacy-contract', 'professor', 'issue399-legacy-function', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Aluno" ("id", "professorId", "contractId", "status", "createdAt", "updatedAt")
VALUES ('issue399-legacy-aluno', 'issue399-legacy-professor', 'issue399-legacy-contract', 'LEAD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "TrainingPlan" ("id", "professorId", "alunoId", "name", "startDate", "endDate", "createdAt", "updatedAt")
VALUES ('issue399-legacy-plan', 'issue399-legacy-professor', 'issue399-legacy-aluno', 'Issue 399 legacy plan', '2026-10-01T12:00:00Z', '2026-12-31T12:00:00Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "ExerciseLibrary" ("id", "name", "contractId", "createdAt", "updatedAt")
VALUES ('issue399-legacy-exercise-library', 'Issue 399 legacy exercise', 'issue399-legacy-contract', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "WorkoutTemplate" ("id", "planId", "mesocycleNumber", "weekNumber", "weekStartDate", "createdAt", "updatedAt")
VALUES ('issue399-legacy-template', 'issue399-legacy-plan', 1, 1, '2026-10-05T12:00:00Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "WorkoutDay" ("id", "templateId", "dayOfWeek", "workoutDate", "createdAt", "updatedAt")
VALUES ('issue399-legacy-day', 'issue399-legacy-template', 1, '2026-10-05T12:00:00Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "WorkoutExercise" ("id", "workoutDayId", "exerciseId", "section", "exerciseOrder", "createdAt", "updatedAt")
VALUES ('issue399-legacy-workout-exercise', 'issue399-legacy-day', 'issue399-legacy-exercise-library', 'sessao', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "WorkoutExecution" ("id", "workoutExerciseId", "alunoId", "executionDate", "setsCompleted", "repsCompleted", "loadUsed", "createdAt")
VALUES ('issue399-legacy-execution', 'issue399-legacy-workout-exercise', 'issue399-legacy-aluno', '2026-10-05T12:00:00Z', 1, 10, 20.5, CURRENT_TIMESTAMP);

COMMIT;
