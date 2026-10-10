/** Response schemas of the synthetic FHIR R4-shaped resources. Nested elements are described, not enumerated. */
import { z } from '@hono/zod-openapi';

const element = (description: string) => z.record(z.string(), z.unknown()).openapi({ description });
const list = (description: string) => z.array(z.record(z.string(), z.unknown())).openapi({ description });
const iso = (description: string) => z.string().datetime().openapi({ description });

const Meta = z
  .object({ tag: z.array(z.object({ system: z.string(), code: z.string(), display: z.string() })) })
  .openapi({
    description:
      'Every resource carries the tag `urn:rest-in-pieces:synthetic|synthetic`: this is invented test data, not a real person or record.',
  });
const Subject = z.object({ reference: z.string().openapi({ example: 'Patient/12' }) }).openapi({
  description: 'A reference to a `Patient` that exists (1 to 1,000) and was alive when this happened.',
});

export const FhirPatient = z
  .object({
    resourceType: z.literal('Patient'),
    id: z.string().openapi({ example: '12' }),
    meta: Meta,
    identifier: list('A synthetic medical record number, `MRN-0000012`.'),
    active: z.boolean().openapi({ description: 'False for a patient who has died.' }),
    name: list('One official name: `family`, `given` and `text`.'),
    telecom: list('A phone number in the range kept for fiction and an `example.com` email, whatever `safe` says.'),
    gender: z.enum(['male', 'female', 'other', 'unknown']),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    deceasedBoolean: z.literal(false).optional(),
    deceasedDateTime: iso(
      'When the patient died, after their sixtieth birthday; present instead of `deceasedBoolean`.',
    ).optional(),
    address: list('A home address: street, city, state, postal code and country.'),
    maritalStatus: element('HL7 v3 MaritalStatus code; adults only.').optional(),
    communication: list('The language of the locale.'),
  })
  .openapi('Patient');

export const FhirObservation = z
  .object({
    resourceType: z.literal('Observation'),
    id: z.string(),
    meta: Meta,
    status: z.enum(['final', 'preliminary', 'amended', 'corrected', 'entered-in-error']),
    category: list('HL7 observation-category: `vital-signs` or `laboratory`.'),
    code: element("A code from this project's own list in `urn:rest-in-pieces:synthetic:observation`, not LOINC."),
    subject: Subject,
    effectiveDateTime: iso('After the patient was born and before they died.'),
    issued: iso('At or after `effectiveDateTime`.'),
    valueQuantity: element("A value with a UCUM unit, plausible for the patient's age on `effectiveDateTime`."),
    interpretation: list(
      'HL7 v3 ObservationInterpretation: `N`, `H` or `L`, matching `valueQuantity` against `referenceRange`.',
    ),
    referenceRange: list('A typical range for illustration only. Not clinical guidance.'),
  })
  .openapi('Observation');

export const FhirCondition = z
  .object({
    resourceType: z.literal('Condition'),
    id: z.string(),
    meta: Meta,
    clinicalStatus: element('HL7 condition-clinical: active, remission, inactive or resolved.'),
    verificationStatus: element('HL7 condition-ver-status: confirmed, provisional or unconfirmed.'),
    category: list(
      'HL7 condition-category: `problem-list-item` for chronic conditions, `encounter-diagnosis` for acute ones.',
    ),
    code: element(
      "A code from this project's own list in `urn:rest-in-pieces:synthetic:condition`, not SNOMED CT or ICD.",
    ),
    subject: Subject,
    onsetDateTime: iso('After the patient was born, and after they were old enough for the condition to occur.'),
    abatementDateTime: iso('After `onsetDateTime`; present unless the condition is active.').optional(),
    recordedDate: iso('At or after `onsetDateTime`.'),
  })
  .openapi('Condition');

export const FhirEncounter = z
  .object({
    resourceType: z.literal('Encounter'),
    id: z.string(),
    meta: Meta,
    status: z.enum(['planned', 'in-progress', 'finished', 'cancelled']),
    class: element('HL7 v3 ActCode: AMB, EMER, IMP, VR or HH.'),
    type: list("A code from this project's own list in `urn:rest-in-pieces:synthetic:encounter-type`."),
    subject: Subject,
    period: element(
      '`start`, and `end` after it for a finished encounter. A planned one starts after 2026-01-01; an in-progress or cancelled one has no end.',
    ),
    reasonCode: list("A condition from this project's own list."),
    serviceProvider: element('A made-up clinic name.'),
  })
  .openapi('Encounter');

export const FhirBundle = z
  .object({
    resourceType: z.literal('Bundle'),
    type: z.literal('searchset'),
    meta: Meta,
    total: z.number().int().openapi({ description: 'Every match, not only this page.' }),
    link: z.array(z.object({ relation: z.string(), url: z.string() })),
    entry: z.array(
      z.object({
        fullUrl: z.string(),
        resource: z.record(z.string(), z.unknown()),
        search: z.object({ mode: z.literal('match') }),
      }),
    ),
  })
  .openapi('FhirBundle');

export const OperationOutcome = z
  .object({
    resourceType: z.literal('OperationOutcome'),
    issue: z.array(
      z.object({
        severity: z.enum(['fatal', 'error', 'warning', 'information']),
        code: z.string().openapi({ example: 'invalid' }),
        diagnostics: z.string(),
      }),
    ),
  })
  .openapi('OperationOutcome');
