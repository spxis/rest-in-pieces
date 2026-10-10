# Synthetic patients, in the shape of FHIR R4

Invented patients, observations, conditions and encounters for building and testing healthcare software, as datasets (`/patients`, `/observations`, `/conditions`, `/encounters`) and through a small FHIR-style server (`/fhir/Patient`, `/fhir/Observation`, …). [Back to the README](https://github.com/spxis/rest-in-pieces#endpoints).

## Read this first

**Every record is invented.** Nothing here was derived from, learned from, sampled from or anonymised from a real person, patient, record or population. Names, birth dates, addresses, readings and histories are drawn from a seed by rules written in this repository.

- **It is not de-identified data**, because it was never identified data. De-identification is something done to real records; nothing was done to any here, and nothing here claims to meet a de-identification standard (HIPAA Safe Harbor, Expert Determination, GDPR anonymisation or any other). Do not describe it that way.
- **It claims no statistical resemblance to any real population.** The ages, conditions and readings are plausible so that software has sensible things to display, not distributions anyone has validated. It is not machine learning and it is not a model of anything.
- **A name, address or number may match a real one by coincidence**, as any invented name can. Contact details are always of the kind nobody answers: phone numbers from the ranges kept for fiction and email addresses at `example.com`, whatever `safe` is set to.
- **The clinical codes are this project's own.** They are short, hand-made lists in `urn:rest-in-pieces:synthetic:…` code systems. They are **not** SNOMED CT, LOINC, ICD or CPT codes and carry nothing from those licensed tables. Where FHIR itself publishes a free code system (administrative gender, observation status and category, condition status, encounter class, interpretation, marital status) the standard HL7 code is used, and units are UCUM. If your software needs real terminology, map these codes to it yourself.
- **Reference ranges are typical figures for illustration**, and values are plausible for an age. None of it is clinical guidance, and nothing should be used to train, validate or evaluate a clinical decision tool, for research, or in any setting where a person is affected.
- **Shaped like FHIR R4, not validated against it.** The resources have the elements, types and references of FHIR R4's Patient, Observation, Condition and Encounter, and the required elements are present, but they are not run through a profile validator, claim no conformance to any implementation guide, and carry only a few of each resource's optional elements. The server answers FHIR-style Bundles and `OperationOutcome` errors for the searches listed below; it is not a conformant FHIR server.
- Every resource, every Bundle and the CapabilityStatement carry the tag `urn:rest-in-pieces:synthetic|synthetic` ("Synthetic test data. Not a real person or a real record.") so a record can never be mistaken for a real one downstream.

## The datasets

Plain REST in Pieces datasets: paging, sorting, filters, search, formats, `locale`, `seed` and the simulation, and no writes. Each record is a FHIR resource; ids are strings, `1` to `1000`.

```sh
curl 'http://localhost:6800/patients?limit=3&seed=7'
curl 'http://localhost:6800/observations?limit=5'
curl 'http://localhost:6800/conditions?locale=ja&limit=5&format=ndjson'
```

`status` is also the request parameter that simulates an HTTP error, so on `/observations` and `/encounters` filter it as `status[eq]=final`. Fields that hold objects cannot be filtered directly (`subject` is `{ "reference": "Patient/12" }`); use `q=Patient/12`, or the FHIR search below, which does.

## What agrees with what

Each patient's birth date and gender are a function of the seed and the id alone, the same in every locale, so any resource can be checked against its patient. The rest of a patient (name, address) follows the `locale`.

| Resource | Rules every record keeps |
| -------- | ------------------------ |
| `Patient` | Ages from newborn to ninety, middle-aged most common; `birthDate` before the data's "now" (2026-01-01); a few of the old have died (`deceasedDateTime` after their sixtieth birthday, `active` false); a medical record number `MRN-0000012` for patient 12; marital status for adults only |
| `Observation` | `subject` is a patient that exists; `effectiveDateTime` is after they were born and before they died; `issued` is at or after it; the value has a UCUM unit and is plausible for the patient's age on that day (an infant's heart rate is not an adult's; a newborn weighs a few kilograms); `interpretation` (`N`, `H`, `L`) matches the value against the `referenceRange` beside it |
| `Condition` | `subject` is a patient that exists; `onsetDateTime` is after birth, after the patient was old enough for the condition (hypertension and type 2 diabetes from 30, osteoarthritis from 50), and before death; `recordedDate` is at or after it; an `active` condition has no `abatementDateTime`, every other has one after the onset; chronic conditions are on the problem list, acute ones are encounter diagnoses and mostly resolved |
| `Encounter` | `subject` is a patient that exists; a `finished` encounter ends after it starts and before the patient died; a `planned` one starts after 2026-01-01; an `in-progress` or `cancelled` one has no end; an inpatient encounter is an admission; a patient who has died has only finished encounters |

The code lists: observations (`heart-rate`, `respiratory-rate`, `body-temperature`, `systolic-blood-pressure`, `diastolic-blood-pressure`, `body-weight`, `body-height`, `oxygen-saturation`, `blood-glucose`, `total-cholesterol`, `hemoglobin`, `serum-creatinine`), fourteen conditions from `hypertension` to `ear-infection`, and nine encounter types. `GET /resources` lists the fields of each dataset.

## The FHIR-style server

```sh
curl 'http://localhost:6800/fhir/Patient?gender=female&birthdate=ge1990-01-01&_count=5'
curl 'http://localhost:6800/fhir/Observation?patient=Patient/12&code=heart-rate'
curl 'http://localhost:6800/fhir/Encounter?status=planned'
curl 'http://localhost:6800/fhir/Patient/12'
curl 'http://localhost:6800/fhir/metadata'
```

It answers `application/fhir+json`: a searchset `Bundle` (`total`, `link` with `next` and `previous`, `entry` with `fullUrl`, `resource` and `search.mode`), the resource itself for a read, and an `OperationOutcome` for an error. `seed`, `locale` and the latency and error simulation (`delay`, `trickle`, `fail`, `status=503`) work as everywhere else.

| Resource | Search parameters |
| -------- | ----------------- |
| `Patient` | `_id`, `identifier`, `family`, `given`, `name`, `gender`, `birthdate`, `active` |
| `Observation` | `_id`, `patient`, `subject`, `code`, `category`, `status`, `date` |
| `Condition` | `_id`, `patient`, `subject`, `code`, `category`, `clinical-status`, `onset-date` |
| `Encounter` | `_id`, `patient`, `subject`, `status`, `class`, `type`, `date` |

Token parameters take `code` or `system|code`, several separated by commas (`gender=male,female`); string parameters match the start of a value, ignoring case; date parameters take the prefixes `eq`, `ne`, `gt`, `lt`, `ge` and `le` and a date or date-time; `patient` takes `12` or `Patient/12`. Paging is `_count` (0 to 100, default 10) and `_offset` (an extension: FHIR's own paging uses opaque links, and the Bundle's `next` link carries `_offset`).

**A parameter the server does not support is a `400` that names it, never ignored**, because a search that quietly drops a filter returns the wrong patients: `_sort`, `_include`, `_revinclude`, chained and composite searches and the rest. So is a value it cannot read. Only JSON is served (`_format=json` is accepted, `xml` is refused). Nothing is written: there is no `POST`, `PUT` or `DELETE`, no `$everything`, and no transactions.

## Bounded like everything else

Every request is bounded in work and output: a Bundle carries at most 100 entries, a dataset page at most 1,000 records, and the datasets are 1,000 resources each, built once per seed and locale. Nothing runs on a timer and nothing is fetched.

The static fixtures on the live demo carry these four datasets in the default locale only, since they are large; every locale still answers them from the API.
