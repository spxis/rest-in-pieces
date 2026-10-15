---
title: Upgrading and adopting the SDK
section: upgrading
order: 12
description: Preserve existing requests while checking safe values, adapters, formats and generated types.
---

## From 2.x to 3.x

[The complete 3.0 upgrade guide](../upgrading-to-3.md) preserves the release's changes and compatibility choices. Safe values are now the default: example-domain emails and URLs, reserved phone ranges and self-hosted images. `safe=false` is the explicit previous-format choice. Real country/subdivision data and seven-country address generation are separate from invented people.

## Choose an entry for the environment

The main module is the Node app; `/core` is an independent in-process factory. `/browser`, `/msw` and `/vite` adapt that core. `/images` and `/serialize` are small pure entries. `/types` supplies generated OpenAPI types without runtime JavaScript. `/element` and `/element/define` retain the native embed contract. The package version and existing public export paths remain unchanged by this documentation rollout.

## Adopting from another test backend

Keep your client's request and loading/error assertions, then map its query vocabulary to [the actual HTTP controls](../api-guide.md). Compare supported CRUD/session behavior, relationships, authentication and schemas before treating another backend's conventions as aliases. [The retained comparison and integrations](../use-with.md) and [use cases](../use-cases.md) give the native recipes.

## Revalidate generated artifacts

Build before using the generated declaration entry, keep CLI and browser import paths distinct, and run the source, docs, browser, README and installed-package gates.
