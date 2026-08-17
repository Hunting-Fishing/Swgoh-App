-- Complete the two remaining workbook-backed Guild Intelligence modules using
-- versioned requirement/reference evidence. These records are explicitly NOT live TB state.
create table if not exists public.platoon_reference_archives (
  id uuid primary key default gen_random_uuid(),
  reference_key text not null unique,
  source text not null,
  source_ref text not null,
  source_sha256 text not null,
  payload_sha256 text not null,
  record_count integer not null check(record_count >= 0),
  resolved_base_ids integer not null check(resolved_base_ids >= 0),
  coverage jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.platoon_reference_archives enable row level security;
revoke all on public.platoon_reference_archives from anon,authenticated;

insert into public.platoon_reference_archives(reference_key,source,source_ref,source_sha256,payload_sha256,record_count,resolved_base_ids,coverage,metadata)
values
('rote-platoons-lv-v1','lv-unit-tracker-workbook','ROTE Platoons','4465e6e86933525be963ef10e93a12c4c33d861236f58d3a90864df91e57fe7d','013850b741b227f9039dbd9364fc254c4f6dc1c3b1fc1140f82a80612bc6eaa4',210,210,
 jsonb_build_object('unitCount',210,'characterCount',167,'shipCount',43,'zones',3,'zone1',jsonb_build_object('dsSlots',90,'mixedSlots',90,'lsSlots',90),'zone2',jsonb_build_object('dsSlots',90,'mixedSlots',90,'lsSlots',90),'zone3',jsonb_build_object('dsSlots',90,'mixedSlots',89,'lsSlots',91),'sourceColumns','unit-centric zone/alignment counts + relic gates'),
 jsonb_build_object('detailLevel','parsed-reference-index-v1','sourceRows',1047,'forensicSource','LV Unit Tracker (new) / ROTE Platoons','liveEventState',false)),
('echobase-platoons-lv-v1','lv-unit-tracker-workbook','EchoBase Platoons','4465e6e86933525be963ef10e93a12c4c33d861236f58d3a90864df91e57fe7d','0dd702d685dffbe3aa3ff06a61063b96922cc635e2cb9f0810bcbffd4d15d5f2',1616,1616,
 jsonb_build_object('slotCount',1616,'uniqueUnits',262,'phases',6,'alignments',jsonb_build_array('ds','mixed','ls'),'phase1Slots',270,'phase2Slots',270,'phase3Slots',270,'phase4Slots',270,'phase5Slots',270,'phase6Slots',266,'relic5Slots',270,'relic6Slots',270,'relic7Slots',270,'relic8Slots',270,'relic9Slots',536,'operationsPerAlignment',6),
 jsonb_build_object('detailLevel','parsed-reference-index-v1','sourceRows',953,'resolvedBaseIdRate',1.0,'forensicSource','LV Unit Tracker (new) / EchoBase Platoons','liveEventState',false))
on conflict(reference_key) do update set source_sha256=excluded.source_sha256,payload_sha256=excluded.payload_sha256,record_count=excluded.record_count,resolved_base_ids=excluded.resolved_base_ids,coverage=excluded.coverage,metadata=excluded.metadata,updated_at=now();

update public.guild_intelligence_page_registry
set implementation_status='partial',
    expected_sources=(select array_agg(distinct x order by x) from unnest(expected_sources || array['platoon_reference_archives']) x)
where page_key in ('rote_platoons','echobase_platoons');

-- The runtime historical-page coverage function also reads this archive and returns
-- source/payload hashes, resolved Base ID counts, compact requirement coverage, and
-- liveEventState=false for these two pages. See the production migration history for
-- the complete function body; subsequent environments receive the function from the
-- Guild Intelligence historical coverage migrations plus this reference archive.
