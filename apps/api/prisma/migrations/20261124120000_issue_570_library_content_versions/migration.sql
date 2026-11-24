-- #570: an editorial version changes only with exercise CONTENT, not with review workflow actions.
-- The existing technical "version" and append-only revision log remain unchanged.
ALTER TABLE "ExerciseLibrary"
  ADD COLUMN "contentVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "systemDefault" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "ExerciseLibrary"
  ADD CONSTRAINT "ExerciseLibrary_contentVersion_positive" CHECK ("contentVersion" > 0);

-- Derive prior editorial versions from immutable snapshots. Do not manufacture
-- new revisions merely because an existing row gains derived version metadata.
ALTER TABLE "ExerciseLibrary" DISABLE TRIGGER issue394_exercise_before_write;
ALTER TABLE "ExerciseLibrary" DISABLE TRIGGER issue394_exercise_after_write;
WITH chronological AS (
  SELECT "exerciseId",
         snapshot - ARRAY['id', 'contractId', 'createdAt', 'updatedAt', 'version', 'contentVersion', 'systemDefault', 'curationStatus', 'createdByUserId', 'reviewedByUserId', 'reviewedAt', 'lastModifiedByUserId', 'lastCurationAction', 'legacyGrandfathered'] AS content,
         LAG(snapshot - ARRAY['id', 'contractId', 'createdAt', 'updatedAt', 'version', 'contentVersion', 'systemDefault', 'curationStatus', 'createdByUserId', 'reviewedByUserId', 'reviewedAt', 'lastModifiedByUserId', 'lastCurationAction', 'legacyGrandfathered']) OVER (
           PARTITION BY "exerciseId" ORDER BY "version"
         ) AS previous
  FROM "ExerciseLibraryRevision"
), editorial AS (
  SELECT "exerciseId",
         (1 + COUNT(*) FILTER (
           WHERE previous IS NOT NULL AND content IS DISTINCT FROM previous
         ))::INTEGER AS content_version
  FROM chronological GROUP BY "exerciseId"
)
UPDATE "ExerciseLibrary" AS exercise
SET "contentVersion" = editorial.content_version
FROM editorial WHERE exercise."id" = editorial."exerciseId";
ALTER TABLE "ExerciseLibrary" ENABLE TRIGGER issue394_exercise_before_write;
ALTER TABLE "ExerciseLibrary" ENABLE TRIGGER issue394_exercise_after_write;

-- On UPDATE, only a real change to editorial fields advances contentVersion.
-- Workflow actions continue advancing "version" for concurrency and audit.
CREATE FUNCTION issue570_content_version_on_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['id', 'contractId', 'createdAt', 'updatedAt', 'version', 'contentVersion', 'systemDefault', 'curationStatus', 'createdByUserId', 'reviewedByUserId', 'reviewedAt', 'lastModifiedByUserId', 'lastCurationAction', 'legacyGrandfathered'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['id', 'contractId', 'createdAt', 'updatedAt', 'version', 'contentVersion', 'systemDefault', 'curationStatus', 'createdByUserId', 'reviewedByUserId', 'reviewedAt', 'lastModifiedByUserId', 'lastCurationAction', 'legacyGrandfathered']) THEN
    NEW."contentVersion" := OLD."contentVersion" + 1;
  ELSE
    NEW."contentVersion" := OLD."contentVersion";
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issue570_exercise_content_version
BEFORE UPDATE ON "ExerciseLibrary"
FOR EACH ROW EXECUTE FUNCTION issue570_content_version_on_update();

-- Reviewed professional approvals keep the existing stringent clinical/media
-- predicate. Canonical system defaults may be approved AS SYSTEM CATALOG DATA
-- without forging a reviewer, instructions, media ownership or license.
ALTER TABLE "ExerciseLibrary" DROP CONSTRAINT "ExerciseLibrary_approved_curated_guard";
ALTER TABLE "ExerciseLibrary"
  ADD CONSTRAINT "ExerciseLibrary_approved_curated_guard"
  CHECK (
    "curationStatus" <> 'approved' OR "legacyGrandfathered" = TRUE OR (
      "systemDefault" = TRUE
      AND COALESCE(BTRIM("name"), '') <> ''
      AND "lastCurationAction" IN (
        'system_defaults_install', 'system_defaults_approval', 'system_defaults_repair'
      )
    ) OR (
      COALESCE(BTRIM("name"), '') <> ''
      AND COALESCE(BTRIM("category"), '') <> ''
      AND COALESCE("capacity" IN ('resisted','flexibility','cyclic','balance'), FALSE)
      AND COALESCE(CARDINALITY("instructions"), 0) > 0
      AND "reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL
      AND "lastCurationAction" IS NOT DISTINCT FROM 'approve'
      AND (COALESCE(BTRIM("videoUrl"), '') = '' OR (
        COALESCE(BTRIM("mediaOrigin"), '') <> ''
        AND COALESCE(BTRIM("mediaLicense"), '') <> ''
      ))
    )
  ) NOT VALID;

-- The canonical JSON is the source of these migration-time names and URLs.
-- Promote ONLY previously installed system defaults with an untouched sequence
-- of machine-generated revisions. Custom/user-edited/catalog-copy records are
-- excluded even if their names match. Never replace an existing video or alter
-- media of an exercise already referenced by a workout.
UPDATE "ExerciseLibrary" AS exercise
SET "systemDefault" = TRUE,
    "curationStatus" = 'approved',
    "lastCurationAction" = 'system_defaults_approval',
    "videoUrl" = CASE
      WHEN COALESCE(BTRIM(exercise."videoUrl"), '') = ''
       AND NOT EXISTS (
         SELECT 1 FROM "WorkoutExercise" AS workout
         WHERE workout."exerciseId" = exercise."id"
       )
      THEN COALESCE(source."videoUrl", exercise."videoUrl")
      ELSE exercise."videoUrl"
    END
FROM (VALUES
    ('Abdominal Bicicleta', 'https://www.youtube.com/watch?v=b0HQ_YahhIw'),
    ('Abdominal infra no solo', 'https://www.youtube.com/watch?v=9EYiA8gbnRA&ab_channel=EXECU%C3%87%C3%83ODEEXERC%C3%8DCIOS'),
    ('Abdominal Pé a Pé', 'https://www.youtube.com/watch?v=OsRjsjeqQkE'),
    ('Abdominal Remador', 'https://www.youtube.com/watch?v=AcOd9heDh0M'),
    ('Abdominal Reto', 'https://www.youtube.com/watch?v=gL-QzFrjDvE'),
    ('Abdominal Reto na Prancha', 'https://www.youtube.com/watch?v=V3oi1dMzeqU&ab_channel=EXECU%C3%87%C3%83ODEEXERC%C3%8DCIOS'),
    ('Abdominal Reto Vela', 'https://www.youtube.com/watch?v=iUOqq6z0UWU&ab_channel=RedePersonalTrainer'),
    ('Abdominal roda', 'https://www.youtube.com/shorts/8KwjIcKKJEY'),
    ('Abdominal Twist', 'https://www.youtube.com/watch?v=lEfJvTBeVOw&ab_channel=GoLiveConsultoriaFitness'),
    ('Abdução de quadril com caneleira', 'https://www.youtube.com/watch?v=h2Etkvq5OZs&ab_channel=TreinoCorreto'),
    ('Afundo', 'https://www.youtube.com/watch?v=oVIzHQOE4-0'),
    ('Agachamento', 'https://www.youtube.com/watch?v=fzofRJAufTs'),
    ('Agachamento Búlgaro', 'https://www.youtube.com/watch?v=Kki52we6xsk&ab_channel=Let%C3%ADciaAlvesPersonalTrainer'),
    ('Agachamento com Arremesso', NULL),
    ('Agachamento Livre', 'https://www.youtube.com/watch?v=bceruIjFAZ0&ab_channel=DillDinizBodyHealthy'),
    ('Arco e Flecha na banda', NULL),
    ('Arremesso', 'https://www.youtube.com/watch?v=krVa7y6KKLc&ab_channel=EstelaAlto%C3%A9'),
    ('Banco Sóleo', 'https://www.youtube.com/watch?v=nCIfBeO8bK8'),
    ('Barra fixa', 'https://www.youtube.com/shorts/UYWz_zrVIwM'),
    ('Deslocamento Lateral com Miniband', NULL),
    ('Bicicleta', NULL),
    ('Cadeira Abdutora', 'https://www.youtube.com/watch?v=LwnVvj44g6Y&ab_channel=CloudGym'),
    ('Cadeira Adutora', 'https://www.youtube.com/watch?v=svne6eikuek'),
    ('Cadeira Extensora', 'https://www.youtube.com/watch?v=FhwuM3VjAEs'),
    ('Cadeira Flexora', 'https://www.youtube.com/watch?v=hlH9c3N7q7o'),
    ('Cão Caçador', 'https://www.youtube.com/watch?v=ZVr9oxya9ks&ab_channel=GoLiveConsultoriaFitness'),
    ('Crucifixo', 'https://www.youtube.com/watch?v=IWv6yR3_IYE'),
    ('Crucifixo Inclinado', 'https://www.youtube.com/watch?v=lAwcPh307qY'),
    ('Crucifixo Inverso na Polia', 'https://www.youtube.com/watch?v=73RM_iOmgk4'),
    ('Crucifixo Inverso Sentado', 'https://www.youtube.com/watch?v=_tzNDF-0HFE'),
    ('Crucifixo no Crossover', 'https://www.youtube.com/watch?v=8OylwuOodgo'),
    ('Desenvolvimento Deltoide', 'https://www.youtube.com/watch?v=o2LfBH1I8r8&ab_channel=MyTrainingPRO'),
    ('Desenvolvimento Lombar', 'https://www.youtube.com/watch?v=jcQCfZ3saUo&ab_channel=4NutritionOficial'),
    ('Desenvolvimento Quebrado', 'https://www.youtube.com/watch?v=-txSmuNw51Y'),
    ('Dorsiflexão Unilateral com Elástico', 'https://www.youtube.com/watch?v=xKG2t33G96c&ab_channel=DiogenesPersonal'),
    ('Elevação de Quadril com Abdução na Banda Elástica', 'https://www.youtube.com/watch?v=qfVOU5SffxM'),
    ('Elevação de quadril com flexão de joelho no pano', 'https://www.youtube.com/watch?v=ncR572Iq5mc&ab_channel=PedroNogueira'),
    ('Elevação de Quadril e Flexão de Joelho na Bola', 'https://www.youtube.com/watch?v=CmQ7XQXcFZg'),
    ('Elevação de Quadril Unilateral no Banco', 'https://www.youtube.com/watch?v=IYi2bnAYWq0&ab_channel=AcessoSa%C3%BAdeePerformance'),
    ('Elevação Frontal', 'https://www.youtube.com/watch?v=3K7iSpMydmU'),
    ('Elevação Frontal na Polia', 'https://www.youtube.com/watch?v=w6_jyJeVJrQ'),
    ('Elevação Lateral', 'https://www.youtube.com/watch?v=Fze5dpzM-cc&ab_channel=AcessoSa%C3%BAdeePerformance'),
    ('Elevação Lateral e Frontal', 'https://www.youtube.com/watch?v=IMYFbHr1O9E&ab_channel=MetafitAcademiaNogueira'),
    ('Elevação Pélvica', 'https://www.youtube.com/watch?v=CIeWtTNpS5M'),
    ('Eliptico', NULL),
    ('Equilíbrio em cruz no trampolim', 'https://www.youtube.com/watch?v=hK1jFiCNsgQ&ab_channel=SSO'),
    ('Equilibrio Monopedal II', 'https://www.youtube.com/watch?v=Xxgk-HZj_5w'),
    ('Esteira', NULL),
    ('Flexão de Braço', 'https://www.youtube.com/watch?v=eDxuLnx30N4'),
    ('Flexão de braço Declinada', 'https://www.youtube.com/shorts/6LBPIZCchXk'),
    ('Flexão de braço na bola', 'https://www.youtube.com/watch?v=Gsk6UnZj0-A&ab_channel=BRUNORABELO'),
    ('Flexão de braço spider man', 'https://www.youtube.com/watch?v=aU14xbyQZN4&ab_channel=AcessoSa%C3%BAdeePerformance'),
    ('Flexão Nórdica', 'https://www.youtube.com/watch?v=0PZItOvQjBU&ab_channel=MarcosAlves'),
    ('Flexão Nórdica Reversa', 'https://www.youtube.com/watch?v=TWsEnefYd44&ab_channel=CloudGym'),
    ('Flexão Plantar com Halteres', 'https://www.youtube.com/shorts/hjUuSB6QjSM'),
    ('Flexão Plantar na Máquina', 'https://www.youtube.com/watch?v=6sSivxVgsS4'),
    ('Fly Inverso', 'https://www.youtube.com/watch?v=zK5P-I1UQVc'),
    ('Fly no peck deck', 'https://www.youtube.com/watch?v=1D9x_U6PkY8&ab_channel=MyTrainingPRO'),
    ('Gato Camelo', 'https://www.youtube.com/watch?v=comObBAaUjc&ab_channel=FisicAcademia'),
    ('Lat PullDown', 'https://www.youtube.com/watch?v=7XYIrBg9n7o'),
    ('Leg Press', 'https://www.youtube.com/watch?v=2vGqIvWl35M'),
    ('Leg Pull Down', 'https://www.youtube.com/watch?v=thWCfX407QY&ab_channel=EricMiyamoto'),
    ('Levantamento Terra', 'https://www.youtube.com/watch?v=wFf6OZF_jcQ'),
    ('Mobilidade de Ombro I', 'https://www.youtube.com/watch?v=hkEp2LNjuLM'),
    ('Mobilidade de Quadril - Cócoras', 'https://www.youtube.com/watch?v=Mpsq-Fy7lJE&ab_channel=FisicAcademia'),
    ('Mobilidade de Quadril - Iliopsoas', 'https://www.youtube.com/watch?v=0S5ZFH1ZXIk'),
    ('Mobilidade de Quadril Alternado', 'https://www.youtube.com/watch?v=ZVhI3KRVkJU'),
    ('Mobilidade de Quadril em S', 'https://www.youtube.com/watch?app=desktop&v=PuqGqrkNjuo&ab_channel=LuisDiasTreinador'),
    ('Mobilidade de tornozelo', 'https://www.youtube.com/watch?v=qh7KaN8FRZk&ab_channel=FisicAcademia'),
    ('Mobilidade Posterior de Coxa', 'https://youtube.com/shorts/IwgLZfrgiJ8?feature=share'),
    ('Mobilidade Quadril - Sumô', 'https://www.youtube.com/watch?app=desktop&v=M1WdayPrL9M&ab_channel=MatheusPersonalNutri'),
    ('Mobilidade Torácica na Parede', 'https://www.youtube.com/watch?app=desktop&v=JHEzkSZfGFE&ab_channel=FisicAcademia'),
    ('Natação', NULL),
    ('Ostra', 'https://www.youtube.com/watch?v=ODeJeMrib_Y'),
    ('Panturrilha Leg Press', 'https://www.youtube.com/watch?v=aPhesY3Z0RI&t=1s&ab_channel=MyTrainingPRO'),
    ('Peck Deck', 'https://www.youtube.com/watch?v=_EVWlFF6isM'),
    ('Pista', NULL),
    ('Polichinelo', 'https://www.youtube.com/watch?v=UcUfmsfrteQ&ab_channel=SuporteSa%C3%BAde'),
    ('Polichinelo (Tempo)', 'https://www.youtube.com/watch?v=UcUfmsfrteQ&ab_channel=SuporteSa%C3%BAde'),
    ('Prancha', 'https://www.youtube.com/watch?v=_Mtelnmyuy'),
    ('Prancha Dinâmica na Bola', 'https://www.youtube.com/watch?v=JOXCgIBTzxU&ab_channel=TreinoCorreto'),
    ('Prancha Dorsal', 'https://www.youtube.com/watch?v=dVU3sRU3HGQ'),
    ('Prancha Lateral', 'https://www.youtube.com/watch?v=Nh2Xx2XhyYE&ab_channel=4NutritionOficial'),
    ('Prancha Lateral com Rotação', 'https://www.youtube.com/watch?v=8k281Y-3dUM'),
    ('Pulley frente', 'https://www.youtube.com/watch?v=FeMAUZAeGpA'),
    ('Remada Alta', 'https://www.youtube.com/watch?v=QZD6vq22qJg&ab_channel=MyTrainingPRO'),
    ('Remada Alta na Polia', 'https://www.youtube.com/watch?v=nK7jNqFtacw'),
    ('Remada Curvada', 'https://www.youtube.com/watch?v=-wDGlBM12ME'),
    ('Remada Frontal Máquina', 'https://www.youtube.com/watch?v=mWtLSTGH_TQ&ab_channel=MuriloPereira'),
    ('Remada Horizontal com Movimentação do Tronco', 'https://www.youtube.com/watch?v=EZq1W-9BvSE'),
    ('Remada Horizontal sem Movimentação do Tronco', NULL),
    ('Rosca Alternada', 'https://www.youtube.com/watch?v=pZaYFAQ4iXE'),
    ('Rosca Biceps na Polia', 'https://www.youtube.com/watch?v=xoQyfNQmbII'),
    ('Rosca Direta', 'https://www.youtube.com/watch?v=qDnkwCak8dY'),
    ('Rosca Direta com Halteres', 'https://www.youtube.com/watch?v=Zs_ouM2Hls8'),
    ('Rosca Inclinado', 'https://www.youtube.com/watch?v=Os0CbdSre6I&ab_channel=TreinoCorreto'),
    ('Rosca Martelo com Halteres', 'https://www.youtube.com/watch?v=5vPGH1uTtbs&ab_channel=MyTrainingPRO'),
    ('Rotação Externa com Elástico', 'https://www.youtube.com/watch?v=A5mR54wS3sM'),
    ('Rotação Externa com Halter', 'https://www.youtube.com/shorts/HwrvCBMHzE0'),
    ('Rotação Externa na Polia', 'https://www.youtube.com/watch?v=FnrGqZSJtFg&ab_channel=TreinoCorreto'),
    ('Skipping Alto', 'https://www.youtube.com/watch?v=rx6Mp3l4KXM&ab_channel=FisicAcademia'),
    ('Skipping Baixo', 'https://www.youtube.com/watch?v=8Ko6fh_BhkE&ab_channel=FisicAcademia'),
    ('Stiff', 'https://www.youtube.com/watch?v=c63ny-K72AM'),
    ('Superman', 'https://www.youtube.com/watch?v=GQr90DLBHuU'),
    ('Supino', 'https://www.youtube.com/watch?v=fDecNfPreTw'),
    ('Supino (Tempo)', 'https://www.youtube.com/watch?v=fDecNfPreTw'),
    ('Supino Declinado', 'https://www.youtube.com/watch?v=T55wncAz1tM'),
    ('Supino Inclinado', 'https://www.youtube.com/watch?v=Yo2PeAt3Z-g'),
    ('Triceps Coice na Polia', 'https://www.youtube.com/watch?v=zn8e8NhYPLI'),
    ('Tríceps Francês', 'https://www.youtube.com/watch?v=hMY9E-qy20k&ab_channel=MyTrainingPRO'),
    ('Tríceps Polia', 'https://www.youtube.com/watch?v=lqkY-rU_UTQ'),
    ('Tríceps Testa', 'https://www.youtube.com/watch?v=qUJfyM5hQEY'),
    ('Tríceps Testa polia', 'https://www.youtube.com/watch?v=ZB-3ROMTEg4&ab_channel=CloudGym'),
    ('Abdominal reto no Smith', 'https://www.youtube.com/watch?v=n0gE2shdzcA'),
    ('Inclinação Lateral do Tronco', 'https://www.youtube.com/watch?v=k2UtDH8PBhA'),
    ('Elevação Lateral Sentado', 'https://www.youtube.com/shorts/BQ1yXM2J5Vs'),
    ('Encolhimento no Smith', 'https://www.youtube.com/watch?v=cT5_GyOXIgE'),
    ('Supino com Halteres', NULL),
    ('Supino Inclinado com Halteres', NULL),
    ('Flexão de braço com rotação de tronco', NULL),
    ('Prancha tocando os ombros', NULL),
    ('Prancha tocando os pés', 'https://www.youtube.com/watch?v=_QWb5heCfjE&ab_channel=CrossOpenOficial'),
    ('Supino na Máquina', NULL),
    ('Supino no Smith', NULL),
    ('Supino com arremesso', NULL),
    ('Flexão com impulsão', NULL),
    ('Pullover', NULL),
    ('Pulley com pegada Supinada', 'https://www.youtube.com/shorts/b5RkrNs_EGM'),
    ('Subida unilateral no Degrau', 'https://www.youtube.com/shorts/dy-RfrEBzxU'),
    ('Abdominal Canoa', 'https://www.youtube.com/shorts/2gdz0ezBSbU'),
    ('Face Pull', 'https://www.youtube.com/shorts/OqlnDwp1PEc'),
    ('Kettlebell Swing', 'https://www.youtube.com/shorts/vSCbZwkoYcY'),
    ('Abdominal Escalador', 'https://www.youtube.com/shorts/z1PN3Ct-2Ww'),
    ('Burpee', 'https://www.youtube.com/watch?v=auBLPXO8Fww&ab_channel=CrossFit'),
    ('Remada Invertida no Smith', 'https://www.youtube.com/shorts/tY48_hQHfuk'),
    ('Salto bipodal', 'https://www.youtube.com/watch?v=iiJcBBucUp4&ab_channel=UnderTrackCenter'),
    ('Remada Horizontal com pegada aberta', NULL),
    ('Remada Cavalinho', NULL),
    ('Crucifixo inverso em pé', NULL),
    ('Crucifixo inverso com apoio ventral no banco', NULL),
    ('Crucifixo inverso ao nível da escápula', NULL),
    ('Abdominal Máquina', NULL),
    ('LED Desloc. Anteroposterior', NULL),
    ('LED Desloc. Médio lateral', NULL),
    ('LED Desloc. Médio lateral Cruzado', NULL),
    ('LED Prancha Super Man', NULL),
    ('Stiff Polia Baixa', NULL),
    ('Sissy Squat', NULL),
    ('Agachamento livre com peso do corpo', 'https://youtu.be/gC5WDrdXzMQ?feature=shared'),
    ('Agachamento smith', NULL),
    ('Leg press 45§', NULL),
    ('Cadeira Adutora + Cadeira Abdutora', NULL),
    ('Crucifixo máquina', NULL),
    ('Mesa flexora (deitada)', NULL),
    ('Alongamento piriforme com bola', 'https://www.youtube.com/shorts/LZ_Uv8WcGeo'),
    ('Corda', 'https://www.youtube.com/shorts/ihm2nvsgKSM'),
    ('Abdominal canoa lateral', 'https://www.youtube.com/shorts/MHyv4Eiod5c'),
    ('Abdominal obliquo na polia alta', 'https://www.youtube.com/shorts/qc1imAzPk5s'),
    ('Abdominal Obliquo na polia média', 'https://www.youtube.com/watch?v=aMpBcqian_s'),
    ('Cadeira Extensora - Perna Direita', NULL),
    ('Descanso de 2 minutos', NULL),
    ('Esteira - 5 km o mais rápido possível', NULL),
    ('Esteira - 2 km o mais rápido possível', NULL),
    ('Esteira - 3 km o mais rápido possível', NULL),
    ('Esteira - 10 km o mais rápido possível', NULL),
    ('Rosca Inversa', 'https://www.youtube.com/shorts/mcUpjlWlGZY'),
    ('Rosca Scott', 'https://www.youtube.com/shorts/90_d-DsrOkE'),
    ('Extensão de quadril com elástico', 'https://www.youtube.com/watch?v=pQE8R8H9c-E&ab_channel=CinesioPro'),
    ('Flexão do arco plantar com estabilidade', 'https://www.youtube.com/shorts/74t1CvNN5Iw'),
    ('Fortalecimento isométrico do arco plantar', 'https://www.youtube.com/watch?v=3wlD0wrAJ0k&ab_channel=Eric'),
    ('Alongamento Iliotibial I', 'https://www.youtube.com/watch?v=MhSCRCsEktg&ab_channel=ClinitiMovimentoHumano'),
    ('Alongamento Iliotibial II', 'https://www.youtube.com/shorts/s_tp1a_yZFI'),
    ('Alongamento Iliotibial III', 'https://www.youtube.com/shorts/j4wDNkvImVc'),
    ('cão caçador com a bola', NULL),
    ('Esteira Intervalada', NULL),
    ('Mobilidade Quadril - Abdução/Adução', 'https://www.youtube.com/watch?v=NVk7h55tHsU&ab_channel=MizaelPereiraPilates'),
    ('Mobilidade de Pelve na bola', 'https://www.youtube.com/shorts/yMtObsaGMHU'),
    ('Mobilidade de Pelve no solo', 'https://www.youtube.com/watch?v=D-2ttzZIyPA&ab_channel=GrupoLongevit%C3%A1'),
    ('Afundo com salto', 'https://www.youtube.com/watch?v=1In6USFzDsw&ab_channel=TreinoCorreto'),
    ('Afundo com Elevação de Joelhos', 'https://www.youtube.com/shorts/YLsysb5YvmY'),
    ('Agachamento Búlgaro com salto', 'https://www.youtube.com/shorts/CoGkyFIfrsc'),
    ('Agachamento com Salto', 'https://www.youtube.com/watch?v=p6miSld2sGs&ab_channel=DNAPlus'),
    ('Cadeira Flexora unilateral', 'https://www.youtube.com/shorts/2lP3h0KzLiw'),
    ('Salto Unipodal na caixa', 'https://www.youtube.com/watch?v=scQ2_XwPIDM&ab_channel=OttoLeonePersonal'),
    ('Salto unipodal', 'https://www.youtube.com/watch?v=Kimgp0WGR34&ab_channel=NicolasCastroBrull'),
    ('Salto unipodal com descida', 'https://www.youtube.com/shorts/7VuAFdKIgk8'),
    ('Salto bipodal na caixa', 'https://www.youtube.com/shorts/fjFCtaIFUks'),
    ('Agachamento Búlgaro c/ salto cone', 'https://www.youtube.com/shorts/W-XYD2e_3C8'),
    ('Semi-agachamento com abdução', 'https://www.youtube.com/shorts/du4mFj-8qdM'),
    ('Saltitos Bipodais', 'https://www.youtube.com/watch?v=a9mVsf9-hOs&ab_channel=VictorAlves-FisioterapiaEsportiva'),
    ('Equilíbrio em 4 apoios na bola', 'https://www.youtube.com/watch?v=PGyrgckWxHc&ab_channel=MarcioCorchs')
) AS source("name", "videoUrl")
WHERE issue394_exercise_canonical_name(exercise."name")
    = issue394_exercise_canonical_name(source."name")
  AND exercise."curationStatus" = 'draft'
  AND exercise."legacyGrandfathered" = FALSE
  AND exercise."reviewedByUserId" IS NULL
  AND exercise."lastCurationAction" IN (
    'system_defaults_install', 'system_defaults_repair'
  )
  AND EXISTS (
    SELECT 1 FROM "ExerciseLibraryRevision" AS baseline
    WHERE baseline."exerciseId" = exercise."id"
      AND baseline."contractId" = exercise."contractId"
      AND baseline."version" = 1
      AND baseline."action" = 'system_defaults_install'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ExerciseLibraryRevision" AS other
    WHERE other."exerciseId" = exercise."id"
      AND other."contractId" = exercise."contractId"
      AND other."action" NOT IN (
        'system_defaults_install', 'system_defaults_repair'
      )
  );
