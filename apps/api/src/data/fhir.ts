/**
 * Synthetic patients, shaped like FHIR R4: Patient, Observation, Condition and Encounter.
 *
 * EVERYTHING HERE IS INVENTED. No record was derived from, learned from or anonymised from a real person or a real
 * record: names, birth dates, addresses, readings and histories are drawn from a seed by rules written in this file. It
 * is not de-identified data, because it was never identified; it makes no claim about statistical resemblance to any
 * population, and a name or address may match a real one by coincidence. It is for building and testing software, not for
 * research, training clinical models or anything with consequences for a person.
 *
 * The clinical codes are this project's own: short hand-made lists in `urn:rest-in-pieces:synthetic:…` code systems.
 * They are not SNOMED CT, LOINC, ICD or CPT codes and carry nothing from those licensed tables; mapping them to a real
 * terminology is up to the project using them. Where FHIR itself defines a free code system (administrative gender,
 * observation status and category, condition status, encounter class, interpretation) the standard HL7 code is used, and
 * units are UCUM.
 *
 * What makes the records useful for testing is that they agree with each other. A patient's birth date and sex are a
 * function of the seed and the patient's id alone, so an observation, condition or encounter for patient 12 is made
 * after patient 12 was born (and before death, if the patient died), and a reading is plausible for the patient's age:
 * an infant's heart rate is not an adult's. Reference ranges are typical figures for illustration only, not clinical guidance.
 */
import type { Faker } from '@faker-js/faker';
import { MAX_RECORDS } from '../lib/collection.ts';
import type { Locale } from '../lib/locale.ts';
import { hashOf, safeEmail, safePhone } from '../lib/safe.ts';
import { build, type Maker } from './build.ts';
import { cached } from './cache.ts';
import { DAY, END, HOUR, iso, MINUTE, moment, SECOND } from './domains.ts';
import { mix, stream } from './random.ts';

// ---- vocabulary ---------------------------------------------------------------------------------------------

/** The code systems of this project's own hand-made lists. They are identifiers, not addresses that resolve. */
export const SYSTEMS = {
  synthetic: 'urn:rest-in-pieces:synthetic',
  mrn: 'urn:rest-in-pieces:synthetic:mrn',
  observation: 'urn:rest-in-pieces:synthetic:observation',
  condition: 'urn:rest-in-pieces:synthetic:condition',
  encounterType: 'urn:rest-in-pieces:synthetic:encounter-type',
  /** FHIR's own free code systems, published by HL7. */
  identifierType: 'http://terminology.hl7.org/CodeSystem/v2-0203',
  maritalStatus: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus',
  observationCategory: 'http://terminology.hl7.org/CodeSystem/observation-category',
  interpretation: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
  conditionClinical: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  conditionVerification: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  conditionCategory: 'http://terminology.hl7.org/CodeSystem/condition-category',
  actCode: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  language: 'urn:ietf:bcp:47',
  ucum: 'http://unitsofmeasure.org',
} as const;

/** What every resource says about itself, so a record can never be mistaken for a real one. */
export const SYNTHETIC_TAG = {
  system: SYSTEMS.synthetic,
  code: 'synthetic',
  display: 'Synthetic test data. Not a real person or a real record.',
} as const;

export const FHIR_VERSION = '4.0.1';

/** Patients, and so the most any other resource points at. */
export const PATIENT_COUNT = MAX_RECORDS;

/** Keys that keep each resource's streams apart from every other dataset's. */
const KEYS = { patient: 41, observation: 42, condition: 43, encounter: 44 } as const;

const YEAR = 365.25 * DAY;
const pad = (value: number, width: number) => String(value).padStart(width, '0');
const day = (time: number) => iso(time).slice(0, 10);

// ---- the patient a record points at -------------------------------------------------------------------------

export type Gender = 'male' | 'female' | 'other' | 'unknown';

/** What every resource needs to know about patient `id`: a function of the seed and the id alone. */
export interface PatientCore {
  gender: Gender;
  /** Midnight UTC of the day they were born. */
  born: number;
  /** When they died, or null. */
  died: number | null;
}

/** The ages patients are drawn from: a mix that has children, adults and the old, with the middle most common. */
const AGE_BANDS = [
  { from: 0, to: 1, weight: 2 },
  { from: 1, to: 12, weight: 11 },
  { from: 12, to: 18, weight: 7 },
  { from: 18, to: 40, weight: 28 },
  { from: 40, to: 65, weight: 30 },
  { from: 65, to: 90, weight: 22 },
] as const;

export function patientCore(seed: number, id: number): PatientCore {
  const random = stream(mix(seed, KEYS.patient, id));
  const gender = (['male', 'female', 'other', 'unknown'] as const)[random.weighted([49, 49, 1, 1])] as Gender;
  const band = AGE_BANDS[random.weighted(AGE_BANDS.map((entry) => entry.weight))] as (typeof AGE_BANDS)[number];
  // At least a few days old, so every patient has been alive for some of the data's time.
  const age = Math.max(0.01, band.from + random.next() * (band.to - band.from));
  const born = Math.floor((END - age * YEAR) / DAY) * DAY;
  // A few of the old have died, at some point in the last five years and after their sixtieth birthday.
  const mortal = age > 60 && random.chance(0.06);
  const lastYears = Math.max(born + 60 * YEAR, END - 5 * YEAR);
  const died = mortal ? Math.floor(lastYears + random.next() * (END - 2 * DAY - lastYears)) : null;
  return { gender, born, died };
}

/** Whole years between two moments, as a birthday counts them. */
export function ageAt(born: number, time: number): number {
  const a = new Date(born);
  const b = new Date(time);
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) {
    years--;
  }
  return years;
}

/** The last moment something about a patient can have happened: death, or the end of the data. */
const lastMoment = (core: PatientCore) => Math.min(END - HOUR, core.died ?? END - HOUR);

const patientId = (faker: Faker) => faker.number.int({ min: 1, max: PATIENT_COUNT });
const reference = (id: number) => ({ reference: `Patient/${id}` });
const coding = (system: string, code: string, display: string) => ({ system, code, display });

// ---- Patient ------------------------------------------------------------------------------------------------

export interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  meta: { tag: (typeof SYNTHETIC_TAG)[] };
  identifier: object[];
  active: boolean;
  name: object[];
  telecom: object[];
  gender: Gender;
  birthDate: string;
  deceasedBoolean?: false;
  deceasedDateTime?: string;
  address: object[];
  maritalStatus?: object;
  communication: object[];
}

const MARITAL = [
  { code: 'S', display: 'Never Married' },
  { code: 'M', display: 'Married' },
  { code: 'D', display: 'Divorced' },
  { code: 'W', display: 'Widowed' },
] as const;

export const makePatient =
  (seed: number): Maker<FhirPatient> =>
  ({ faker, country, code: localeCode }, i) => {
    const id = i + 1;
    const core = patientCore(seed, id);
    const sex = core.gender === 'male' || core.gender === 'female' ? core.gender : undefined;
    const given = faker.person.firstName(sex);
    const family = faker.person.lastName(sex);
    const adult = ageAt(core.born, END) >= 18;
    const key = hashOf(`patient:${seed}:${id}`);
    const married = adult ? MARITAL[faker.number.int({ min: 0, max: MARITAL.length - 1 })] : undefined;
    return {
      resourceType: 'Patient',
      id: String(id),
      meta: { tag: [SYNTHETIC_TAG] },
      identifier: [
        {
          use: 'usual',
          type: { coding: [coding(SYSTEMS.identifierType, 'MR', 'Medical record number')] },
          system: SYSTEMS.mrn,
          value: `MRN-${pad(id, 7)}`,
        },
      ],
      active: core.died === null,
      name: [{ use: 'official', family, given: [given], text: `${given} ${family}` }],
      // Contact details are always the kind nobody answers: fiction-range phone numbers and example.com addresses.
      telecom: [
        { system: 'phone', value: safePhone(country, key), use: 'mobile' },
        {
          system: 'email',
          value: safeEmail(`${given}.${family}@example.com`.toLowerCase().replace(/[^a-z0-9.@]/g, '')),
        },
      ],
      gender: core.gender,
      birthDate: day(core.born),
      ...(core.died === null
        ? { deceasedBoolean: false as const }
        : { deceasedDateTime: iso(Math.floor(core.died / SECOND) * SECOND) }),
      address: [
        {
          use: 'home',
          line: [faker.location.streetAddress()],
          city: faker.location.city(),
          state: faker.location.state(),
          postalCode: faker.location.zipCode(),
          country,
        },
      ],
      ...(married ? { maritalStatus: { coding: [coding(SYSTEMS.maritalStatus, married.code, married.display)] } } : {}),
      communication: [
        {
          language: { coding: [{ system: SYSTEMS.language, code: localeCode.split('-')[0] ?? 'en' }] },
          preferred: true,
        },
      ],
    };
  };

// ---- Observation --------------------------------------------------------------------------------------------

interface ObservationKind {
  code: string;
  display: string;
  category: 'vital-signs' | 'laboratory';
  unit: string;
  /** The UCUM code of `unit`. */
  ucum: string;
  weight: number;
  digits: number;
  /** A typical range for the patient, for illustration; and the range a reading is drawn from, with a share outside it. */
  range(age: number, gender: Gender): { low: number; high: number };
}

const adultRange = (age: number, child: [number, number], teen: [number, number], adult: [number, number]) =>
  age < 12 ? child : age < 18 ? teen : adult;
const pair = ([low, high]: [number, number]) => ({ low, high });

export const OBSERVATION_KINDS: readonly ObservationKind[] = [
  {
    code: 'heart-rate',
    display: 'Heart rate',
    category: 'vital-signs',
    unit: 'beats/minute',
    ucum: '/min',
    weight: 14,
    digits: 0,
    range: (age) => pair(age < 1 ? [100, 160] : adultRange(age, [70, 120], [60, 100], [60, 100])),
  },
  {
    code: 'respiratory-rate',
    display: 'Respiratory rate',
    category: 'vital-signs',
    unit: 'breaths/minute',
    ucum: '/min',
    weight: 8,
    digits: 0,
    range: (age) => pair(age < 1 ? [30, 60] : adultRange(age, [18, 30], [12, 20], [12, 20])),
  },
  {
    code: 'body-temperature',
    display: 'Body temperature',
    category: 'vital-signs',
    unit: 'degC',
    ucum: 'Cel',
    weight: 9,
    digits: 1,
    range: () => ({ low: 36.1, high: 37.5 }),
  },
  {
    code: 'systolic-blood-pressure',
    display: 'Systolic blood pressure',
    category: 'vital-signs',
    unit: 'mmHg',
    ucum: 'mm[Hg]',
    weight: 10,
    digits: 0,
    range: (age) => pair(age < 12 ? [90, 110] : age < 18 ? [100, 125] : [100, 130]),
  },
  {
    code: 'diastolic-blood-pressure',
    display: 'Diastolic blood pressure',
    category: 'vital-signs',
    unit: 'mmHg',
    ucum: 'mm[Hg]',
    weight: 10,
    digits: 0,
    range: (age) => pair(age < 12 ? [55, 75] : [60, 85]),
  },
  {
    code: 'body-weight',
    display: 'Body weight',
    category: 'vital-signs',
    unit: 'kg',
    ucum: 'kg',
    weight: 8,
    digits: 1,
    range: (age, gender) =>
      pair(
        age < 1
          ? [3, 11]
          : age < 12
            ? [10 + age * 2, 18 + age * 3.5]
            : age < 18
              ? [40, 80]
              : gender === 'female'
                ? [50, 85]
                : [65, 100],
      ),
  },
  {
    code: 'body-height',
    display: 'Body height',
    category: 'vital-signs',
    unit: 'cm',
    ucum: 'cm',
    weight: 6,
    digits: 0,
    range: (age, gender) =>
      pair(
        age < 1
          ? [50, 76]
          : age < 12
            ? [75 + age * 6, 90 + age * 6.5]
            : age < 18
              ? [145, 185]
              : gender === 'female'
                ? [152, 176]
                : [165, 192],
      ),
  },
  {
    code: 'oxygen-saturation',
    display: 'Oxygen saturation',
    category: 'vital-signs',
    unit: '%',
    ucum: '%',
    weight: 8,
    digits: 0,
    range: () => ({ low: 95, high: 100 }),
  },
  {
    code: 'blood-glucose',
    display: 'Blood glucose',
    category: 'laboratory',
    unit: 'mmol/L',
    ucum: 'mmol/L',
    weight: 9,
    digits: 1,
    range: () => ({ low: 4, high: 6 }),
  },
  {
    code: 'total-cholesterol',
    display: 'Total cholesterol',
    category: 'laboratory',
    unit: 'mmol/L',
    ucum: 'mmol/L',
    weight: 6,
    digits: 1,
    range: () => ({ low: 3.5, high: 5.2 }),
  },
  {
    code: 'hemoglobin',
    display: 'Hemoglobin',
    category: 'laboratory',
    unit: 'g/dL',
    ucum: 'g/dL',
    weight: 6,
    digits: 1,
    range: (_age, gender) => (gender === 'female' ? { low: 12, high: 15.5 } : { low: 13.5, high: 17.5 }),
  },
  {
    code: 'serum-creatinine',
    display: 'Serum creatinine',
    category: 'laboratory',
    unit: 'umol/L',
    ucum: 'umol/L',
    weight: 6,
    digits: 0,
    range: (_age, gender) => (gender === 'female' ? { low: 45, high: 90 } : { low: 60, high: 110 }),
  },
];

const OBSERVATION_STATUSES = [
  { value: 'final' as const, weight: 90 },
  { value: 'preliminary' as const, weight: 5 },
  { value: 'amended' as const, weight: 3 },
  { value: 'corrected' as const, weight: 1 },
  { value: 'entered-in-error' as const, weight: 1 },
];

export interface FhirObservation {
  resourceType: 'Observation';
  id: string;
  meta: { tag: (typeof SYNTHETIC_TAG)[] };
  status: 'final' | 'preliminary' | 'amended' | 'corrected' | 'entered-in-error';
  category: object[];
  code: object;
  subject: { reference: string };
  effectiveDateTime: string;
  /** At or after `effectiveDateTime`. */
  issued: string;
  valueQuantity: { value: number; unit: string; system: string; code: string };
  interpretation: object[];
  referenceRange: object[];
}

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const makeObservation =
  (seed: number): Maker<FhirObservation> =>
  ({ faker }, i) => {
    const subject = patientId(faker);
    const core = patientCore(seed, subject);
    const kind = faker.helpers.weightedArrayElement(
      OBSERVATION_KINDS.map((entry) => ({ value: entry, weight: entry.weight })),
    );
    const last = lastMoment(core);
    const effective = moment(faker, Math.max(core.born, last - 3 * YEAR), last);
    const age = ageAt(core.born, effective);
    const { low, high } = kind.range(age, core.gender);
    // Most readings sit inside the range; about one in six strays outside it, a little or a lot.
    const outside = faker.datatype.boolean({ probability: 0.16 });
    const width = high - low;
    const value = outside
      ? faker.datatype.boolean()
        ? high + width * faker.number.float({ min: 0.05, max: 0.6 })
        : low - width * faker.number.float({ min: 0.05, max: 0.4 })
      : faker.number.float({ min: low, max: high });
    const quantity = Math.max(0, round(value, kind.digits));
    const state = quantity > high ? 'H' : quantity < low ? 'L' : 'N';
    const meaning = { H: 'High', L: 'Low', N: 'Normal' }[state];
    return {
      resourceType: 'Observation',
      id: String(i + 1),
      meta: { tag: [SYNTHETIC_TAG] },
      status: faker.helpers.weightedArrayElement(OBSERVATION_STATUSES),
      category: [
        {
          coding: [
            coding(
              SYSTEMS.observationCategory,
              kind.category,
              kind.category === 'vital-signs' ? 'Vital Signs' : 'Laboratory',
            ),
          ],
        },
      ],
      code: { coding: [coding(SYSTEMS.observation, kind.code, kind.display)], text: kind.display },
      subject: reference(subject),
      effectiveDateTime: iso(effective),
      issued: iso(Math.min(END - HOUR, effective + faker.number.int({ min: 1, max: 24 * 60 }) * MINUTE)),
      valueQuantity: { value: quantity, unit: kind.unit, system: SYSTEMS.ucum, code: kind.ucum },
      interpretation: [{ coding: [coding(SYSTEMS.interpretation, state, meaning)] }],
      referenceRange: [
        {
          low: { value: round(low, kind.digits), unit: kind.unit, system: SYSTEMS.ucum, code: kind.ucum },
          high: { value: round(high, kind.digits), unit: kind.unit, system: SYSTEMS.ucum, code: kind.ucum },
        },
      ],
    };
  };

// ---- Condition ----------------------------------------------------------------------------------------------

interface ConditionKind {
  code: string;
  display: string;
  chronic: boolean;
  minAge: number;
  weight: number;
}

export const CONDITION_KINDS: readonly ConditionKind[] = [
  { code: 'hypertension', display: 'Hypertension', chronic: true, minAge: 30, weight: 12 },
  { code: 'type-2-diabetes', display: 'Type 2 diabetes', chronic: true, minAge: 30, weight: 8 },
  { code: 'asthma', display: 'Asthma', chronic: true, minAge: 2, weight: 9 },
  { code: 'hyperlipidemia', display: 'High cholesterol', chronic: true, minAge: 30, weight: 8 },
  { code: 'osteoarthritis', display: 'Osteoarthritis', chronic: true, minAge: 50, weight: 6 },
  { code: 'hypothyroidism', display: 'Underactive thyroid', chronic: true, minAge: 25, weight: 5 },
  { code: 'migraine', display: 'Migraine', chronic: true, minAge: 12, weight: 6 },
  { code: 'anxiety', display: 'Anxiety', chronic: true, minAge: 12, weight: 7 },
  { code: 'seasonal-allergy', display: 'Seasonal allergy', chronic: true, minAge: 3, weight: 9 },
  { code: 'common-cold', display: 'Common cold', chronic: false, minAge: 0, weight: 10 },
  { code: 'urinary-tract-infection', display: 'Urinary tract infection', chronic: false, minAge: 5, weight: 5 },
  { code: 'sprained-ankle', display: 'Sprained ankle', chronic: false, minAge: 5, weight: 4 },
  { code: 'low-back-pain', display: 'Low back pain', chronic: false, minAge: 18, weight: 6 },
  { code: 'ear-infection', display: 'Ear infection', chronic: false, minAge: 0, weight: 5 },
];

export interface FhirCondition {
  resourceType: 'Condition';
  id: string;
  meta: { tag: (typeof SYNTHETIC_TAG)[] };
  clinicalStatus: object;
  verificationStatus: object;
  category: object[];
  code: object;
  subject: { reference: string };
  onsetDateTime: string;
  /** After `onsetDateTime`; present when the condition is no longer active. */
  abatementDateTime?: string;
  /** At or after `onsetDateTime`. */
  recordedDate: string;
}

const CLINICAL = {
  active: 'Active',
  remission: 'Remission',
  inactive: 'Inactive',
  resolved: 'Resolved',
} as const;

export const makeCondition =
  (seed: number): Maker<FhirCondition> =>
  ({ faker }, i) => {
    const subject = patientId(faker);
    const core = patientCore(seed, subject);
    const last = lastMoment(core);
    const age = ageAt(core.born, last);
    const fitting = CONDITION_KINDS.filter((entry) => entry.minAge <= age);
    const kind = faker.helpers.weightedArrayElement(fitting.map((entry) => ({ value: entry, weight: entry.weight })));
    // Onset: after the patient was old enough for it, and after birth, and never later than the last moment there is.
    const oldEnough = core.born + Math.floor(kind.minAge * YEAR);
    const onset = Math.min(last, moment(faker, Math.min(oldEnough, last - DAY), Math.max(last - DAY, oldEnough)));
    const wanted = kind.chronic
      ? faker.helpers.weightedArrayElement([
          { value: 'active' as const, weight: 78 },
          { value: 'remission' as const, weight: 10 },
          { value: 'inactive' as const, weight: 12 },
        ])
      : faker.helpers.weightedArrayElement([
          { value: 'resolved' as const, weight: 86 },
          { value: 'active' as const, weight: 14 },
        ]);
    // A condition that began in the last day cannot already be over.
    const status = last - onset < DAY ? ('active' as const) : wanted;
    const abated =
      status === 'active'
        ? null
        : Math.min(
            last,
            onset +
              (kind.chronic ? faker.number.int({ min: 30, max: 900 }) : faker.number.int({ min: 2, max: 28 })) * DAY,
          );
    return {
      resourceType: 'Condition',
      id: String(i + 1),
      meta: { tag: [SYNTHETIC_TAG] },
      clinicalStatus: { coding: [coding(SYSTEMS.conditionClinical, status, CLINICAL[status])] },
      verificationStatus: {
        coding: [
          (() => {
            const verification = faker.helpers.weightedArrayElement([
              { value: 'confirmed', weight: 90 },
              { value: 'provisional', weight: 8 },
              { value: 'unconfirmed', weight: 2 },
            ]);
            return coding(
              SYSTEMS.conditionVerification,
              verification,
              verification.charAt(0).toUpperCase() + verification.slice(1),
            );
          })(),
        ],
      },
      category: [
        {
          coding: [
            kind.chronic
              ? coding(SYSTEMS.conditionCategory, 'problem-list-item', 'Problem List Item')
              : coding(SYSTEMS.conditionCategory, 'encounter-diagnosis', 'Encounter Diagnosis'),
          ],
        },
      ],
      code: { coding: [coding(SYSTEMS.condition, kind.code, kind.display)], text: kind.display },
      subject: reference(subject),
      onsetDateTime: iso(onset),
      ...(abated === null ? {} : { abatementDateTime: iso(abated) }),
      recordedDate: iso(Math.min(last, onset + faker.number.int({ min: 0, max: 14 * 24 * 60 }) * MINUTE)),
    };
  };

// ---- Encounter ----------------------------------------------------------------------------------------------

const ENCOUNTER_CLASSES = [
  { value: { code: 'AMB', display: 'ambulatory' }, weight: 68 },
  { value: { code: 'EMER', display: 'emergency' }, weight: 10 },
  { value: { code: 'IMP', display: 'inpatient encounter' }, weight: 7 },
  { value: { code: 'VR', display: 'virtual' }, weight: 10 },
  { value: { code: 'HH', display: 'home health' }, weight: 5 },
] as const;

const ENCOUNTER_TYPES = [
  { code: 'routine-visit', display: 'Routine visit', classes: ['AMB', 'VR', 'HH'] },
  { code: 'follow-up', display: 'Follow-up visit', classes: ['AMB', 'VR'] },
  { code: 'annual-physical', display: 'Annual physical', classes: ['AMB'] },
  { code: 'vaccination', display: 'Vaccination', classes: ['AMB'] },
  { code: 'urgent-care', display: 'Urgent care visit', classes: ['AMB', 'EMER'] },
  { code: 'emergency-visit', display: 'Emergency visit', classes: ['EMER'] },
  { code: 'admission', display: 'Hospital admission', classes: ['IMP'] },
  { code: 'telehealth', display: 'Telehealth consultation', classes: ['VR'] },
  { code: 'home-visit', display: 'Home visit', classes: ['HH'] },
] as const;

export interface FhirEncounter {
  resourceType: 'Encounter';
  id: string;
  meta: { tag: (typeof SYNTHETIC_TAG)[] };
  status: 'planned' | 'in-progress' | 'finished' | 'cancelled';
  class: { system: string; code: string; display: string };
  type: object[];
  subject: { reference: string };
  period: { start: string; end?: string };
  reasonCode: object[];
  serviceProvider: { display: string };
}

export const makeEncounter =
  (seed: number): Maker<FhirEncounter> =>
  ({ faker }, i) => {
    const subject = patientId(faker);
    const core = patientCore(seed, subject);
    const last = lastMoment(core);
    const kindClass = faker.helpers.weightedArrayElement(
      ENCOUNTER_CLASSES.map((entry) => ({ value: entry.value, weight: entry.weight })),
    );
    const type = faker.helpers.arrayElement(
      ENCOUNTER_TYPES.filter((entry) => (entry.classes as readonly string[]).includes(kindClass.code)),
    );
    const reasons = CONDITION_KINDS.filter((entry) => entry.minAge <= ageAt(core.born, last));
    const reason = faker.helpers.arrayElement(reasons);
    const status =
      core.died === null
        ? faker.helpers.weightedArrayElement([
            { value: 'finished' as const, weight: 88 },
            { value: 'cancelled' as const, weight: 5 },
            { value: 'planned' as const, weight: 4 },
            { value: 'in-progress' as const, weight: 3 },
          ])
        : ('finished' as const);
    const earliest = Math.max(core.born, last - 5 * YEAR);
    const length =
      kindClass.code === 'IMP'
        ? faker.number.int({ min: 1, max: 9 }) * DAY
        : faker.helpers.arrayElement([15, 20, 30, 30, 45, 60, 90]) * MINUTE;
    let start: number;
    let end: number | undefined;
    if (status === 'planned') {
      start = END + faker.number.int({ min: 1, max: 90 }) * DAY + faker.number.int({ min: 8, max: 17 }) * HOUR;
    } else if (status === 'in-progress') {
      start = moment(faker, Math.max(earliest, END - DAY), END - HOUR);
    } else {
      start = moment(faker, earliest, Math.max(earliest, last - length - HOUR));
      end = Math.min(last, start + length);
      // A cancelled encounter never happened, so it has a start and no end.
      if (status === 'cancelled') end = undefined;
    }
    return {
      resourceType: 'Encounter',
      id: String(i + 1),
      meta: { tag: [SYNTHETIC_TAG] },
      status,
      class: { system: SYSTEMS.actCode, code: kindClass.code, display: kindClass.display },
      type: [{ coding: [coding(SYSTEMS.encounterType, type.code, type.display)], text: type.display }],
      subject: reference(subject),
      period: { start: iso(start), ...(end === undefined ? {} : { end: iso(end) }) },
      reasonCode: [{ coding: [coding(SYSTEMS.condition, reason.code, reason.display)], text: reason.display }],
      serviceProvider: { display: `${faker.company.name().split(/[,]/)[0]} Health Clinic` },
    };
  };

// ---- loading ------------------------------------------------------------------------------------------------

const loader =
  <T extends object>(name: string, make: (seed: number) => Maker<T>) =>
  (seed: number, locale: Locale) =>
    cached(`${name}:${locale}:${seed}`, () => build({ default: make(seed) }, MAX_RECORDS, seed, locale));

export const loadPatients = loader('patients', makePatient);
export const loadObservations = loader('observations', makeObservation);
export const loadConditions = loader('conditions', makeCondition);
export const loadEncounters = loader('encounters', makeEncounter);

/** The top-level elements each resource has, in order, for `/resources`: optional ones are listed too. */
export const FHIR_FIELDS = {
  Patient: [
    'resourceType',
    'id',
    'meta',
    'identifier',
    'active',
    'name',
    'telecom',
    'gender',
    'birthDate',
    'deceasedBoolean',
    'deceasedDateTime',
    'address',
    'maritalStatus',
    'communication',
  ],
  Observation: [
    'resourceType',
    'id',
    'meta',
    'status',
    'category',
    'code',
    'subject',
    'effectiveDateTime',
    'issued',
    'valueQuantity',
    'interpretation',
    'referenceRange',
  ],
  Condition: [
    'resourceType',
    'id',
    'meta',
    'clinicalStatus',
    'verificationStatus',
    'category',
    'code',
    'subject',
    'onsetDateTime',
    'abatementDateTime',
    'recordedDate',
  ],
  Encounter: [
    'resourceType',
    'id',
    'meta',
    'status',
    'class',
    'type',
    'subject',
    'period',
    'reasonCode',
    'serviceProvider',
  ],
} as const;
