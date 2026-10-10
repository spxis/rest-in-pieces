import { describe, expect, it } from 'vitest';
import {
  ageAt,
  CONDITION_KINDS,
  OBSERVATION_KINDS,
  PATIENT_COUNT,
  patientCore,
  SYNTHETIC_TAG,
  SYSTEMS,
} from '../src/data/fhir.ts';
import { LOCALE_CODES } from '../src/lib/locale.ts';
import { type Envelope, request } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: FHIR resources are read by element name
type Resource = Record<string, any>;

const END = Date.parse('2026-01-01T00:00:00Z');
const time = (value: unknown) => Date.parse(value as string);
const all = async (type: string, query = '') =>
  (await request<Envelope<Resource>>(`/${type}?limit=1000&${query}`)).body.results;

/** A seed's patients by id, built from the API the way a client would. */
const patientsOf = async (query: string) =>
  new Map((await all('patients', query)).map((patient) => [patient.id, patient]));

const matrix = ['seed=1&locale=en-CA', 'seed=7&locale=ja', 'seed=99&locale=global', 'seed=3&locale=de'] as const;

describe('every resource says it is synthetic', () => {
  it('carries the tag, in every dataset and in the Bundle and the CapabilityStatement', async () => {
    for (const type of ['patients', 'observations', 'conditions', 'encounters']) {
      for (const resource of await all(type, 'seed=2')) expect(resource.meta.tag, type).toEqual([SYNTHETIC_TAG]);
    }
    const bundle = (await request<Resource>('/fhir/Patient?_count=2')).body;
    expect(bundle.meta.tag).toEqual([SYNTHETIC_TAG]);
    const capability = (await request<Resource>('/fhir/metadata')).body;
    expect(capability.meta.tag).toEqual([SYNTHETIC_TAG]);
    expect(capability.description).toMatch(/invented/);
    expect(capability.description).toMatch(/none is de-identified real data/);
    expect(capability.description).toMatch(/not SNOMED CT, LOINC, ICD or CPT/);
  });

  it('never uses a licensed code system, and says so in the descriptions', async () => {
    const { body } = await request<{ name: string; description: string }[]>('/resources');
    for (const name of ['patients', 'observations', 'conditions', 'encounters']) {
      const description = body.find((resource) => resource.name === name)?.description ?? '';
      expect(description, name).toMatch(/Synthetic: every record is invented/);
      expect(description, name).toMatch(/not SNOMED CT, LOINC, ICD or CPT/);
      expect(description.toLowerCase(), name).not.toMatch(
        /de-identified from real|anonymi[sz]ed real|real patients' data/,
      );
    }
    const everything = JSON.stringify([
      ...(await all('patients')),
      ...(await all('observations')),
      ...(await all('conditions')),
      ...(await all('encounters')),
    ]);
    for (const licensed of ['snomed.info', 'loinc.org', 'hl7.org/fhir/sid/icd', 'ama-assn.org', 'cpt']) {
      expect(everything.toLowerCase(), licensed).not.toContain(licensed);
    }
    const systems = new Set([...everything.matchAll(/"system":"([^"]+)"/g)].map((match) => match[1]));
    // A contact point's `system` is `phone` or `email`; every other system is a code system, and one of ours or HL7's.
    for (const system of [...systems].filter((value) => /^(urn:|https?:)/.test(value as string))) {
      expect([...Object.values(SYSTEMS)], system).toContain(system);
    }
  });
});

describe('Patient', () => {
  it('has the elements of a FHIR R4 Patient, with contact details nobody answers', async () => {
    for (const patient of await all('patients', 'seed=4')) {
      expect(patient.resourceType).toBe('Patient');
      expect(patient.id).toMatch(/^\d+$/);
      expect(['male', 'female', 'other', 'unknown']).toContain(patient.gender);
      expect(patient.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(time(patient.birthDate)).toBeLessThan(END);
      expect(patient.identifier[0].value).toBe(`MRN-${patient.id.padStart(7, '0')}`);
      expect(patient.name[0].family).toBeTruthy();
      expect(patient.name[0].given.length).toBeGreaterThan(0);
      expect(patient.name[0].text).toBe(`${patient.name[0].given[0]} ${patient.name[0].family}`);
      const email = patient.telecom.find((entry: Resource) => entry.system === 'email').value;
      expect(email).toMatch(/@example\.(com|org|net)$/);
      const phone = patient.telecom.find((entry: Resource) => entry.system === 'phone').value;
      expect(phone).toMatch(/555-01\d\d|^07700 900\d{3}$|^\+1 555-01\d\d$|^0\d{2,4} [\d ]+$|^0\d( \d\d){4}$/);
      expect(patient.active).toBe(patient.deceasedBoolean === false);
      if (patient.deceasedDateTime) {
        expect(time(patient.deceasedDateTime)).toBeGreaterThan(time(patient.birthDate) + 60 * 365 * 86_400_000);
        expect(time(patient.deceasedDateTime)).toBeLessThan(END);
      }
    }
  });

  it('are a function of the seed and the id: the same birth date and gender in every locale', async () => {
    const english = await patientsOf('seed=5&locale=en-CA');
    const japanese = await patientsOf('seed=5&locale=ja');
    for (const [id, patient] of english) {
      expect(japanese.get(id)?.birthDate).toBe(patient.birthDate);
      expect(japanese.get(id)?.gender).toBe(patient.gender);
      const core = patientCore(5, Number(id));
      expect(patient.birthDate).toBe(new Date(core.born).toISOString().slice(0, 10));
      expect(patient.gender).toBe(core.gender);
    }
    expect(english.get('1')?.name[0].text).not.toBe(japanese.get('1')?.name[0].text);
  });

  it('range from newborn to ninety, with a few who have died', async () => {
    const ages = [...(await patientsOf('seed=1')).values()].map((patient) => ageAt(time(patient.birthDate), END));
    expect(Math.min(...ages)).toBe(0);
    expect(Math.max(...ages)).toBeGreaterThan(80);
    expect(Math.max(...ages)).toBeLessThanOrEqual(90);
    expect(ages.filter((age) => age < 12).length).toBeGreaterThan(80);
    expect(ages.filter((age) => age >= 65).length).toBeGreaterThan(150);
    const dead = (await all('patients', 'seed=1')).filter((patient) => patient.deceasedDateTime);
    expect(dead.length).toBeGreaterThan(5);
    expect(dead.length).toBeLessThan(120);
  });
});

describe.each(matrix)('the resources agree with their patient (%s)', (query) => {
  it('Observations come after birth and before death, with a plausible value and a matching interpretation', async () => {
    const patients = await patientsOf(query);
    const kinds = new Map(OBSERVATION_KINDS.map((kind) => [kind.code, kind]));
    for (const observation of await all('observations', query)) {
      expect(observation.resourceType).toBe('Observation');
      expect(['final', 'preliminary', 'amended', 'corrected', 'entered-in-error']).toContain(observation.status);
      const patient = patients.get(observation.subject.reference.replace('Patient/', ''));
      expect(patient, observation.subject.reference).toBeDefined();
      const effective = time(observation.effectiveDateTime);
      expect(effective).toBeGreaterThanOrEqual(time(patient?.birthDate));
      expect(effective).toBeLessThan(END);
      if (patient?.deceasedDateTime) expect(effective).toBeLessThanOrEqual(time(patient.deceasedDateTime));
      expect(time(observation.issued)).toBeGreaterThanOrEqual(effective);
      const kind = kinds.get(observation.code.coding[0].code);
      expect(kind, observation.code.coding[0].code).toBeDefined();
      expect(observation.code.coding[0].system).toBe(SYSTEMS.observation);
      expect(observation.valueQuantity.unit).toBe(kind?.unit);
      expect(observation.valueQuantity.system).toBe(SYSTEMS.ucum);
      expect(observation.valueQuantity.code).toBe(kind?.ucum);
      const { low, high } = observation.referenceRange[0];
      const value = observation.valueQuantity.value;
      expect(value).toBeGreaterThanOrEqual(0);
      const expected = value > high.value ? 'H' : value < low.value ? 'L' : 'N';
      expect(observation.interpretation[0].coding[0].code).toBe(expected);
      const age = ageAt(time(patient?.birthDate), effective);
      const range = kind?.range(age, patient?.gender);
      expect(low.value).toBeCloseTo(range?.low ?? Number.NaN, 0);
    }
  });

  it('Observations fit the age of the patient: an infant is not an adult', async () => {
    const patients = await patientsOf(query);
    const rows = await all('observations', query);
    const rate = (min: number, max: number) =>
      rows
        .filter((row) => row.code.coding[0].code === 'heart-rate')
        .map((row) => ({
          age: ageAt(
            time(patients.get(row.subject.reference.replace('Patient/', ''))?.birthDate),
            time(row.effectiveDateTime),
          ),
          value: row.valueQuantity.value as number,
        }))
        .filter((row) => row.age >= min && row.age <= max);
    const infants = rate(0, 0);
    const adults = rate(20, 60);
    expect(adults.length).toBeGreaterThan(5);
    const mean = (list: { value: number }[]) =>
      list.reduce((sum, row) => sum + row.value, 0) / Math.max(1, list.length);
    if (infants.length >= 2) expect(mean(infants)).toBeGreaterThan(mean(adults) + 20);
    const weights = rows
      .filter((row) => row.code.coding[0].code === 'body-weight')
      .map((row) => ({
        age: ageAt(
          time(patients.get(row.subject.reference.replace('Patient/', ''))?.birthDate),
          time(row.effectiveDateTime),
        ),
        value: row.valueQuantity.value as number,
      }));
    for (const row of weights.filter((entry) => entry.age < 1)) expect(row.value).toBeLessThan(25);
    for (const row of weights.filter((entry) => entry.age >= 18)) expect(row.value).toBeGreaterThan(35);
  });

  it('Conditions begin after birth and when the patient was old enough, and end after they begin', async () => {
    const patients = await patientsOf(query);
    const kinds = new Map(CONDITION_KINDS.map((kind) => [kind.code, kind]));
    for (const condition of await all('conditions', query)) {
      expect(condition.resourceType).toBe('Condition');
      const patient = patients.get(condition.subject.reference.replace('Patient/', ''));
      expect(patient, condition.subject.reference).toBeDefined();
      const kind = kinds.get(condition.code.coding[0].code);
      expect(kind, condition.code.coding[0].code).toBeDefined();
      const onset = time(condition.onsetDateTime);
      expect(onset).toBeGreaterThanOrEqual(time(patient?.birthDate));
      expect(onset).toBeLessThanOrEqual(END);
      expect(ageAt(time(patient?.birthDate), onset)).toBeGreaterThanOrEqual((kind?.minAge ?? 0) - 1);
      if (patient?.deceasedDateTime) expect(onset).toBeLessThanOrEqual(time(patient.deceasedDateTime));
      expect(time(condition.recordedDate)).toBeGreaterThanOrEqual(onset);
      const status = condition.clinicalStatus.coding[0].code;
      expect(['active', 'remission', 'inactive', 'resolved']).toContain(status);
      if (status === 'active') expect(condition.abatementDateTime).toBeUndefined();
      else {
        expect(time(condition.abatementDateTime)).toBeGreaterThan(onset);
        expect(time(condition.abatementDateTime)).toBeLessThanOrEqual(END);
      }
      expect(condition.category[0].coding[0].code).toBe(kind?.chronic ? 'problem-list-item' : 'encounter-diagnosis');
      if (!kind?.chronic) expect(['resolved', 'active']).toContain(status);
    }
  });

  it('Encounters end after they start, with the right class and status', async () => {
    const patients = await patientsOf(query);
    const seen = new Set<string>();
    for (const encounter of await all('encounters', query)) {
      expect(encounter.resourceType).toBe('Encounter');
      const patient = patients.get(encounter.subject.reference.replace('Patient/', ''));
      expect(patient, encounter.subject.reference).toBeDefined();
      seen.add(encounter.status);
      const start = time(encounter.period.start);
      expect(start).toBeGreaterThanOrEqual(time(patient?.birthDate));
      expect(['AMB', 'EMER', 'IMP', 'VR', 'HH']).toContain(encounter.class.code);
      expect(encounter.class.system).toBe(SYSTEMS.actCode);
      if (encounter.status === 'finished') {
        expect(time(encounter.period.end)).toBeGreaterThan(start);
        expect(time(encounter.period.end)).toBeLessThanOrEqual(END);
        if (patient?.deceasedDateTime)
          expect(time(encounter.period.end)).toBeLessThanOrEqual(time(patient.deceasedDateTime));
      } else expect(encounter.period.end).toBeUndefined();
      if (encounter.status === 'planned') expect(start).toBeGreaterThan(END);
      else expect(start).toBeLessThan(END);
      if (patient?.deceasedDateTime) expect(encounter.status).toBe('finished');
      if (encounter.class.code === 'IMP') expect(encounter.type[0].coding[0].code).toBe('admission');
    }
    expect(seen.has('finished')).toBe(true);
  });
});

describe('GET /fhir', () => {
  it('answers a searchset Bundle as application/fhir+json, bounded to a hundred entries', async () => {
    const { res, body } = await request<Resource>('/fhir/Patient?_count=3&seed=2');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/fhir+json; charset=utf-8');
    expect(body.resourceType).toBe('Bundle');
    expect(body.type).toBe('searchset');
    expect(body.total).toBe(PATIENT_COUNT);
    expect(body.entry).toHaveLength(3);
    expect(body.entry[0].fullUrl).toMatch(/\/fhir\/Patient\/1$/);
    expect(body.entry[0].resource).toEqual((await request<Resource>('/patients/1?seed=2')).body);
    expect(body.entry[0].search).toEqual({ mode: 'match' });
    expect(body.link.map((link: Resource) => link.relation)).toEqual(['self', 'next']);
    const next = body.link[1].url.replace(/^https?:\/\/[^/]+/, '');
    expect((await request<Resource>(next)).body.entry[0].resource.id).toBe('4');
    expect((await request<Resource>('/fhir/Patient?_count=100')).body.entry).toHaveLength(100);
    for (const bad of ['101', '-1', 'x', '1.5']) {
      const res = await request<Resource>(`/fhir/Patient?_count=${bad}`);
      expect(res.status, bad).toBe(400);
      expect(res.body.resourceType).toBe('OperationOutcome');
    }
    expect((await request<Resource>('/fhir/Patient?_count=0')).body.entry).toEqual([]);
    const last = (await request<Resource>('/fhir/Patient?_count=10&_offset=995')).body;
    expect(last.entry).toHaveLength(5);
    expect(last.link.map((link: Resource) => link.relation)).toEqual(['self', 'previous']);
  });

  it('searches by patient, code, status, date and the rest', async () => {
    const patients = await patientsOf('seed=1');
    const female = (await request<Resource>('/fhir/Patient?gender=female&_count=100')).body;
    expect(female.total).toBe([...patients.values()].filter((patient) => patient.gender === 'female').length);
    expect(female.entry.every((entry: Resource) => entry.resource.gender === 'female')).toBe(true);
    expect((await request<Resource>('/fhir/Patient?gender=male,female')).body.total).toBeGreaterThan(900);
    const born = (await request<Resource>('/fhir/Patient?birthdate=ge2010-01-01&_count=100')).body;
    expect(born.total).toBe([...patients.values()].filter((patient) => patient.birthDate >= '2010-01-01').length);
    const exact = [...patients.values()][0] as Resource;
    expect(
      (await request<Resource>(`/fhir/Patient?birthdate=${exact.birthDate}`)).body.entry.map(
        (entry: Resource) => entry.resource.id,
      ),
    ).toContain(exact.id);
    expect(
      (
        await request<Resource>(
          `/fhir/Patient?family=${encodeURIComponent(exact.name[0].family.slice(0, 3).toLowerCase())}`,
        )
      ).body.entry.map((entry: Resource) => entry.resource.id),
    ).toContain(exact.id);
    expect((await request<Resource>(`/fhir/Patient?identifier=${exact.identifier[0].value}`)).body.total).toBe(1);
    expect(
      (
        await request<Resource>(
          `/fhir/Patient?identifier=${encodeURIComponent(`${SYSTEMS.mrn}|${exact.identifier[0].value}`)}`,
        )
      ).body.total,
    ).toBe(1);
    expect((await request<Resource>('/fhir/Patient?_id=3,5')).body.total).toBe(2);

    const observations = await all('observations', 'seed=1');
    const rates = await request<Resource>('/fhir/Observation?code=heart-rate&_count=100');
    expect(rates.body.total).toBe(observations.filter((row) => row.code.coding[0].code === 'heart-rate').length);
    expect(
      (await request<Resource>(`/fhir/Observation?code=${encodeURIComponent(`${SYSTEMS.observation}|heart-rate`)}`))
        .body.total,
    ).toBe(rates.body.total);
    expect(
      (await request<Resource>(`/fhir/Observation?code=${encodeURIComponent('http://loinc.org|8867-4')}`)).body.total,
    ).toBe(0);
    const subject = observations[0]?.subject.reference as string;
    const mine = await request<Resource>(`/fhir/Observation?patient=${encodeURIComponent(subject)}&_count=100`);
    expect(mine.body.total).toBe(observations.filter((row) => row.subject.reference === subject).length);
    expect((await request<Resource>(`/fhir/Observation?subject=${subject.replace('Patient/', '')}`)).body.total).toBe(
      mine.body.total,
    );
    expect((await request<Resource>('/fhir/Observation?category=laboratory')).body.total).toBe(
      observations.filter((row) => row.category[0].coding[0].code === 'laboratory').length,
    );
    expect((await request<Resource>('/fhir/Observation?status=final')).body.total).toBe(
      observations.filter((row) => row.status === 'final').length,
    );
    const since = (await request<Resource>('/fhir/Observation?date=ge2025-01-01&_count=100')).body;
    expect(since.total).toBe(observations.filter((row) => row.effectiveDateTime >= '2025-01-01').length);
    expect(since.entry.every((entry: Resource) => entry.resource.effectiveDateTime >= '2025-01-01')).toBe(true);
    expect((await request<Resource>('/fhir/Observation?date=lt2025-01-01&_count=100')).body.total + since.total).toBe(
      observations.length,
    );

    expect((await request<Resource>('/fhir/Condition?clinical-status=active')).body.total).toBe(
      (await all('conditions', 'seed=1')).filter((row) => row.clinicalStatus.coding[0].code === 'active').length,
    );
    expect((await request<Resource>('/fhir/Condition?onset-date=ge2020-01-01')).status).toBe(200);
    const encounters = await all('encounters', 'seed=1');
    expect((await request<Resource>('/fhir/Encounter?class=EMER')).body.total).toBe(
      encounters.filter((row) => row.class.code === 'EMER').length,
    );
    expect((await request<Resource>('/fhir/Encounter?status=planned')).body.total).toBe(
      encounters.filter((row) => row.status === 'planned').length,
    );
    expect((await request<Resource>('/fhir/Encounter?type=admission')).body.total).toBe(
      encounters.filter((row) => row.type[0].coding[0].code === 'admission').length,
    );
    expect((await request<Resource>('/fhir/Encounter?date=ge2025-06-01&patient=1')).status).toBe(200);
    expect((await request<Resource>('/fhir/Patient?locale=ja&_count=1')).body.entry[0].resource.id).toBe('1');
  });

  it('refuses a parameter it does not support, instead of ignoring it', async () => {
    for (const [path, message] of [
      ['/fhir/Patient?nickname=bob', /"nickname" is not supported for Patient. Supported: _id, identifier, family/],
      ['/fhir/Observation?value-quantity=gt5', /"value-quantity" is not supported for Observation/],
      ['/fhir/Condition?gender=male', /"gender" is not supported for Condition/],
      ['/fhir/Observation?_sort=date', /"_sort" is not supported/],
      ['/fhir/Observation?_include=Observation:patient', /"_include" is not supported/],
      ['/fhir/Observation?patient=abc', /not a patient reference/],
      ['/fhir/Observation?patient=Patient/1&date=yesterday', /not a date/],
      ['/fhir/Observation?date=sa2025-01-01', /not a date/],
      ['/fhir/Patient?gender=', /not supported|empty|Supported/],
      ['/fhir/Patient?_format=xml', /only|not supported/],
      ['/fhir/Patient?locale=xx', /locale|Unsupported/i],
    ] as const) {
      const { status, body } = await request<Resource>(path);
      expect(status, path).toBe(400);
      expect(body.resourceType, path).toBe('OperationOutcome');
      expect(body.issue[0].diagnostics, path).toMatch(message);
    }
    expect((await request<Resource>('/fhir/Patient?_format=json')).status).toBe(200);
  });

  it('reads one resource, and answers 404 as an OperationOutcome', async () => {
    const one = await request<Resource>('/fhir/Condition/7?seed=3');
    expect(one.status).toBe(200);
    expect(one.body).toEqual((await request<Resource>('/conditions/7?seed=3')).body);
    for (const path of ['/fhir/Patient/0', '/fhir/Patient/1001', '/fhir/Patient/abc', '/fhir/Nope/1', '/fhir/Nope']) {
      const { status, body } = await request<Resource>(path);
      expect(status, path).toBe(404);
      expect(body.issue[0].code).toBe('not-found');
    }
    expect((await request<Resource>('/fhir/Patient/1?locale=xx')).status).toBe(400);
  });

  it('describes itself in a CapabilityStatement and in OpenAPI', async () => {
    const { body } = await request<Resource>('/fhir/metadata');
    expect(body.resourceType).toBe('CapabilityStatement');
    expect(body.fhirVersion).toBe('4.0.1');
    expect(body.rest[0].resource.map((entry: Resource) => entry.type)).toEqual([
      'Patient',
      'Observation',
      'Condition',
      'Encounter',
    ]);
    expect(body.rest[0].resource[0].searchParam.map((param: Resource) => param.name)).toContain('birthdate');
    const spec = (await request<Resource>('/openapi.json')).body;
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(['/fhir/{type}', '/fhir/{type}/{id}', '/fhir/metadata', '/patients', '/observations']),
    );
    expect(spec.tags.map((tag: Resource) => tag.name)).toContain('Synthetic patients (FHIR R4)');
  });

  it('keeps the latency and error simulation, and does not mistake a FHIR status for one', async () => {
    expect((await request('/fhir/Patient?status=503')).status).toBe(503);
    expect((await request('/fhir/Observation?status=final')).status).toBe(200);
    expect((await request('/fhir/Patient?fail=true')).status).toBe(500);
  });
});

describe('the datasets', () => {
  it('list, read by string id, filter and format like the rest', async () => {
    const { body } = await request<{ name: string; fields: string[]; writable: boolean }[]>('/resources');
    expect(body.find((resource) => resource.name === 'patients')?.fields).toContain('birthDate');
    expect(body.find((resource) => resource.name === 'observations')?.writable).toBe(false);
    expect((await request<Resource>('/patients/12')).body.id).toBe('12');
    expect((await request('/patients/99999')).status).toBe(404);
    expect(
      (await request<Envelope<Resource>>('/patients?gender=female&limit=1000')).body.results.every(
        (patient) => patient.gender === 'female',
      ),
    ).toBe(true);
    expect(
      (await request<Envelope<Resource>>('/observations?status[eq]=final&limit=1000')).body.metadata.total,
    ).toBeGreaterThan(800);
    expect((await request('/encounters?limit=2&format=ndjson')).text.trim().split('\n')).toHaveLength(2);
    expect((await request('/conditions?limit=2&format=csv')).text).toContain('resourceType,id,meta');
    expect((await request('/patients?limit=1&format=sql&table=patients')).text).toContain('INSERT INTO "patients"');
    const a = await all('patients', 'seed=6');
    expect(await all('patients', 'seed=6')).toEqual(a);
    expect(await all('patients', 'seed=7')).not.toEqual(a);
  });

  it('serve every locale', async () => {
    for (const locale of [...LOCALE_CODES, 'global']) {
      for (const type of ['patients', 'observations', 'conditions', 'encounters']) {
        const { status, body } = await request<Envelope<Resource>>(`/${type}?locale=${locale}&limit=3`);
        expect(status, `${type} ${locale}`).toBe(200);
        expect(body.results, `${type} ${locale}`).toHaveLength(3);
      }
    }
  });

  it('keep patients from being real: contact details are fiction-range whatever `safe` says', async () => {
    for (const locale of ['en-CA', 'en-US', 'en-GB', 'de', 'fr', 'ja', 'ko', 'global']) {
      for (const patient of (await request<Envelope<Resource>>(`/patients?limit=100&locale=${locale}&safe=false`)).body
        .results) {
        const email = patient.telecom.find((entry: Resource) => entry.system === 'email').value;
        expect(email, locale).toMatch(/@example\.(com|org|net)$/);
      }
    }
  });
});
