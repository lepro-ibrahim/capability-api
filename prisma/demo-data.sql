-- Capability demonstration, 3 August through 12 September 2026.
-- Explicit manual execution only; never part of migrations or deployment.
-- Insert-only, deterministic IDs, reruns skip existing demo leads.
-- Real users/records are never updated. All demo emails are undeliverable.
-- Demo staff have no password. No webhooks or automations are triggered.
-- Planned appointments exist as stage entries only: AppointmentStatus has
-- no PLANNED value, so we never fabricate a future HONORED appointment.
-- Cash-in represents the 30% deposit on WON contracts; the balance is unpaid.
DO $demo$
DECLARE
  w integer; n integer; k integer; j integer;
  lid text; sid text; cid text; target text; path text[];
  ts timestamp; born timestamp; last_ts timestamp; prev text;
  plan_ts timestamp; rv text; status text; actor text;
  price integer; cash integer; ws timestamp;
  terminals text[] := ARRAY[
    'WON','WON','WON','WON','WON','WON','CONTRACT_SIGNED','CONTRACT_SIGNED',
    'FOLLOW_UP_CLOSER','FOLLOW_UP_CLOSER','RV1_HONORED',
    'RV1_PLANNED','RV1_PLANNED','RV1_NO_SHOW','RV1_CANCELED',
    'RV1_POSTPONED','RV1_NOT_QUALIFIED','LOST',
    'FOLLOW_UP','FOLLOW_UP','RV0_PLANNED','RV0_PLANNED',
    'RV0_NO_SHOW','RV0_CANCELED','RV0_POSTPONED','RV0_NOT_QUALIFIED',
    'CALL_ANSWERED','CALL_ATTEMPT','CALL_REQUESTED','LEADS_RECEIVED'];
  firsts text[] := ARRAY['Camille','Alexandre','Emma','Lucas','Inès','Hugo',
    'Sarah','Thomas','Léa','Gabriel','Jade','Nathan','Louise','Adam','Chloé',
    'Louis','Manon','Arthur','Alice','Raphaël','Nina','Paul','Zoé','Maxime',
    'Clara','Ethan','Julie','Victor','Anna','Noah'];
  lasts text[] := ARRAY['Martin','Bernard','Dubois','Petit','Robert','Richard',
    'Durand','Moreau','Simon','Laurent','Lefebvre','Michel','Garcia','Roux',
    'Fontaine','Chevalier','François','Legrand','Garnier','Faure'];
BEGIN
  PERFORM pg_advisory_xact_lock(74120912);
  IF EXISTS (SELECT 1 FROM "User" WHERE email IN
    ('sarah.setter@example.invalid','mehdi.setter@example.invalid',
     'lea.setter@example.invalid','nora.closer@example.invalid',
     'julien.closer@example.invalid','ines.closer@example.invalid')
     AND id NOT LIKE 'demo_v1_%') THEN
    RAISE EXCEPTION 'Demo staff email collision; nothing inserted';
  END IF;
  INSERT INTO "User" (id,"firstName","lastName",email,role,"isActive","createdAt","updatedAt")
  VALUES
    ('demo_v1_setter_1','Sarah (Démo)','Benali','sarah.setter@example.invalid','SETTER',true,'2026-08-01','2026-08-01'),
    ('demo_v1_setter_2','Mehdi (Démo)','Laurent','mehdi.setter@example.invalid','SETTER',true,'2026-08-01','2026-08-01'),
    ('demo_v1_setter_3','Léa (Démo)','Moreau','lea.setter@example.invalid','SETTER',true,'2026-08-01','2026-08-01'),
    ('demo_v1_closer_1','Nora (Démo)','Diallo','nora.closer@example.invalid','CLOSER',true,'2026-08-01','2026-08-01'),
    ('demo_v1_closer_2','Julien (Démo)','Roux','julien.closer@example.invalid','CLOSER',true,'2026-08-01','2026-08-01'),
    ('demo_v1_closer_3','Inès (Démo)','Petit','ines.closer@example.invalid','CLOSER',true,'2026-08-01','2026-08-01')
  ON CONFLICT (id) DO NOTHING;
  FOR w IN 0..5 LOOP
    ws := timestamp '2026-08-03' + w * interval '7 days';
    FOR n IN 1..30 LOOP
      k := w * 30 + n;
      lid := 'demo_v1_lead_' || lpad(k::text,3,'0');
      IF EXISTS (SELECT 1 FROM "Lead" WHERE id=lid) THEN CONTINUE; END IF;
      sid := 'demo_v1_setter_' || (1 + (n+w)%3)::text;
      cid := 'demo_v1_closer_' || (1 + (n/3+w)%3)::text;
      target := terminals[n];
      born := ws + ((n-1)%3)*interval '1 day' + (8+n%4)*interval '1 hour';
      price := (ARRAY[2400,3000,3600,4800])[1+(k%4)];
      path := ARRAY['LEADS_RECEIVED'];
      IF n <= 29 THEN path := path || ARRAY['CALL_REQUESTED']; END IF;
      IF n <= 28 THEN path := path || ARRAY['CALL_ATTEMPT']; END IF;
      IF n <= 27 THEN path := path || ARRAY['CALL_ANSWERED']; END IF;
      IF n <= 26 AND n NOT IN (19,20) THEN
        path := path || ARRAY['RV0_PLANNED'];
        IF n <= 18 THEN
          path := path || ARRAY['RV0_HONORED','RV1_PLANNED'];
          IF n <= 11 OR n=18 THEN
            path := path || ARRAY['RV1_HONORED'];
            IF n <= 10 AND n%2=0 THEN
              path := path || ARRAY['RV2_PLANNED','RV2_HONORED'];
            END IF;
            IF n <= 8 THEN path := path || ARRAY['CONTRACT_SIGNED']; END IF;
          END IF;
        END IF;
      END IF;
      IF path[array_length(path,1)] <> target THEN path := array_append(path,target); END IF;
      -- Determine final stage timestamp before inserting the lead.
      ts := born;
      FOR j IN 2..array_length(path,1) LOOP
        ts := ts + CASE path[j]
          WHEN 'CALL_REQUESTED' THEN interval '15 minutes'
          WHEN 'CALL_ATTEMPT' THEN (10+(k%8)*5)*interval '1 minute'
          WHEN 'CALL_ANSWERED' THEN interval '1 minute'
          WHEN 'RV0_HONORED' THEN interval '6 hours'
          WHEN 'RV1_HONORED' THEN interval '12 hours'
          WHEN 'RV2_HONORED' THEN interval '12 hours'
          ELSE interval '1 hour' END;
      END LOOP;
      last_ts := ts;
      IF last_ts > timestamp '2026-09-12 10:00:00' THEN
        RAISE EXCEPTION 'Demo history in future: %',lid;
      END IF;
      INSERT INTO "Lead" (id,"firstName","lastName",email,tag,source,stage,
        "stageUpdatedAt","opportunityValue","saleValue","setterId","closerId","createdAt","updatedAt")
      VALUES (lid,firsts[n],lasts[1+(k%20)] || ' (Démo)',
        'prospect.' || lpad(k::text,3,'0') || '@example.invalid','DEMO',
        (ARRAY['DEMO · Meta Ads','DEMO · Google Ads','DEMO · Webinaire','DEMO · Recommandation'])[1+(k%4)],
        target::"LeadStage",last_ts,price,CASE WHEN target='WON' THEN price ELSE NULL END,
        sid,CASE WHEN n<=18 THEN cid ELSE NULL END,born,last_ts);
      ts := born; prev := NULL; plan_ts := NULL;
      FOR j IN 1..array_length(path,1) LOOP
        IF j>1 THEN
          ts := ts + CASE path[j]
            WHEN 'CALL_REQUESTED' THEN interval '15 minutes'
            WHEN 'CALL_ATTEMPT' THEN (10+(k%8)*5)*interval '1 minute'
            WHEN 'CALL_ANSWERED' THEN interval '1 minute'
            WHEN 'RV0_HONORED' THEN interval '6 hours'
            WHEN 'RV1_HONORED' THEN interval '12 hours'
            WHEN 'RV2_HONORED' THEN interval '12 hours'
            ELSE interval '1 hour' END;
        END IF;
        actor := CASE WHEN path[j] LIKE 'RV1_%' OR path[j] LIKE 'RV2_%'
          OR path[j] IN ('FOLLOW_UP_CLOSER','CONTRACT_SIGNED','WON','LOST')
          THEN cid ELSE sid END;
        INSERT INTO "StageEvent" (id,"leadId","fromStage","toStage","occurredAt",source,"dedupHash","userId")
        VALUES (lid || '_stage_' || j,lid,prev::"LeadStage",path[j]::"LeadStage",ts,
          'demo-seed:v1',lid || '|' || path[j],actor);
        INSERT INTO "LeadEvent" (id,"leadId",type,meta,"occurredAt","createdAt")
        VALUES (lid || '_event_' || j,lid,'STAGE_ENTER',
          jsonb_build_object('toStage',path[j],'fromStage',prev,'source','demo-seed:v1','actorId',actor,'demo',true),ts,ts);
        INSERT INTO "LeadStageHistory" (id,"leadId",stage,"occurredAt")
        VALUES (lid || '_history_' || j,lid,path[j],ts);
        IF path[j]='CALL_REQUESTED' THEN
          INSERT INTO "CallRequest" (id,"leadId","createdById",channel,"requestedAt",status,"createdAt","updatedAt")
          VALUES (lid || '_request',lid,sid,'DEMO',ts,
            CASE WHEN n=29 THEN 'REQUESTED'::"CallRequestStatus" ELSE 'COMPLETED'::"CallRequestStatus" END,ts,last_ts);
        END IF;
        IF path[j]='CALL_ATTEMPT' THEN
          INSERT INTO "CallAttempt" (id,"leadId","userId","requestId","startedAt","endedAt","durationSec",outcome,notes,"createdAt")
          VALUES (lid || '_call',lid,sid,lid || '_request',ts,
            ts + CASE WHEN n=28 THEN interval '35 seconds' ELSE interval '8 minutes' END,
            CASE WHEN n=28 THEN 35 ELSE 480 END,
            CASE WHEN n=28 THEN 'NO_ANSWER'::"CallOutcome" ELSE 'ANSWERED'::"CallOutcome" END,
            'Simulation DEMO : qualification du besoin et présentation du programme.',ts);
        END IF;
        IF path[j] IN ('RV0_PLANNED','RV1_PLANNED','RV2_PLANNED') THEN plan_ts := ts; END IF;
        IF path[j] ~ '^RV[012]_(HONORED|NO_SHOW|CANCELED|POSTPONED|NOT_QUALIFIED)$' THEN
          rv := left(path[j],3); status := substring(path[j] FROM 5);
          INSERT INTO "Appointment" (id,provider,"externalId",type,status,"scheduledAt","createdAt","leadId","userId")
          VALUES (lid || '_' || rv,'DEMO',lid || '_' || rv,rv::"AppointmentType",
            status::"AppointmentStatus",ts,plan_ts,lid,
            CASE WHEN rv='RV0' THEN sid ELSE cid END);
        END IF;
        IF path[j]='CONTRACT_SIGNED' THEN
          INSERT INTO "Contract" (id,amount,deposit,monthly,total,"createdAt","userId","leadId")
          VALUES (lid || '_contract',price,price*0.3,price*0.7/3,price,ts,cid,lid);
        END IF;
        prev := path[j];
      END LOOP;
    END LOOP;
    SELECT coalesce(sum(c.deposit),0)::integer INTO cash
      FROM "Contract" c JOIN "Lead" l ON l.id=c."leadId"
      WHERE l.id LIKE 'demo_v1_%' AND l.stage='WON'
        AND l."stageUpdatedAt">=ws AND l."stageUpdatedAt"<ws+interval '7 days';
    -- Do not replace a real budget if the week is already occupied.
    INSERT INTO "Budget" (id,period,amount,"weekStart","caEncaisse","createdAt","updatedAt")
    VALUES ('demo_v1_budget_' || w,'WEEKLY',1500+w*120,ws,cash,ws,ws)
    ON CONFLICT DO NOTHING;
  END LOOP;
  FOR n IN 1..3 LOOP
    FOR k IN 1..5 LOOP
      INSERT INTO "Availability" (id,"userId",day,part)
      SELECT 'demo_v1_avail_' || role || '_' || n || '_' || k || '_' || part,
        'demo_v1_' || role || '_' || n,
        (ARRAY['MON','TUE','WED','THU','FRI'])[k]::"DayOfWeek",part::"DayPart"
      FROM unnest(ARRAY['setter','closer']) role CROSS JOIN unnest(ARRAY['MORNING','AFTERNOON']) part
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END
$demo$;
