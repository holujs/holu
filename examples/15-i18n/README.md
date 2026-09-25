## Internationalization (i18n)

This example demonstrates how to **add multi-language support** to a Holu REST application using the `@holu/i18n` package.

### What you'll learn

- How to define type-safe dictionaries with base (English) translations
- How to add language-specific overrides (Polish, Ukrainian)
- How to configure `I18nModule` and `I18nProviders` per module
- How to import and override translations from other modules
- How to create a custom `DictService` (e.g. to read language from the `Accept-Language` header)

### Key files

| File | Purpose |
|------|---------|
| `src/app/first.module.ts` | FirstModule — English/Polish i18n with `defaultLng: 'en'` |
| `src/app/first/i18n/current/_base-en/first.dict.ts` | Base English dictionary (`FirstDict`) |
| `src/app/first/i18n/current/pl/first.dict-pl.ts` | Polish override (`FirstDictPl`) |
| `src/app/second.module.ts` | SecondModule — imports FirstModule's translations and overrides them |
| `src/app/second/i18n/imported/` | Overridden translations imported from FirstModule |
| `src/app/third.module.ts` | ThirdModule — demonstrates custom `DictService` |
| `src/app/third/dict.service.ts` | Custom `MyDictService` — reads language from `Accept-Language` header |

### Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/first?lng=en` | GET | Returns `one, two, three` (English) |
| `/first?lng=pl` | GET | Returns `nie, dwa, trzy` (Polish) |
| `/first-extended?lng=en` | GET | Returns overridden English translation from SecondModule |
| `/first-extended?lng=uk` | GET | Returns overridden Ukrainian translation from SecondModule |
| `/second/:userName?lng=en` | GET | Returns `Hello, {userName}!` (English) |
| `/second/:userName?lng=uk` | GET | Returns `Привіт, {userName}!` (Ukrainian) |
| `/third?lng=en` | GET | Uses custom `DictService`, returns English |
| `/third?lng=pl` | GET | Uses custom `DictService`, returns Polish |

## Prerequisites

If you haven't prepared the examples repository yet, you can do so from the project root:

```bash
yarn install
```

## Running the example

Start the server:

```bash
cd examples/15*
yarn start
```

From another terminal:

```bash
# FirstModule — English and Polish translations
curl -i localhost:3000/first?lng=en
curl -i localhost:3000/first?lng=pl

# SecondModule — overridden imported translations
curl -i localhost:3000/first-extended?lng=en
curl -i localhost:3000/first-extended?lng=pl
curl -i localhost:3000/first-extended?lng=uk

# SecondModule — parameterized greeting
curl -i localhost:3000/second/your-name?lng=en
curl -i localhost:3000/second/your-name?lng=uk

# ThirdModule — custom DictService
curl -i localhost:3000/third?lng=en
curl -i localhost:3000/third?lng=pl
```

## Project structure

```
src/
  main.ts                                         # Application entry point
  app/
    app.module.ts                                 # Root module
    first.module.ts                               # FirstModule — i18n with en/pl
    first/
      first.controller.ts                         # GET /first
      first.service.ts                            # Service using DictService
      i18n/current/
        index.ts                                  # DictGroup registration
        _base-en/first.dict.ts                    # Base English dictionary
        pl/first.dict-pl.ts                       # Polish override
    second.module.ts                              # SecondModule — i18n with en/uk + imported
    second/
      second.controller.ts                        # GET /second/:userName, GET /first-extended
      i18n/current/
        index.ts                                  # DictGroup registration
        _base-en/second.dict.ts                   # Base English dictionary
        _base-en/errors.dict.ts                   # Base English errors dictionary
        uk/second.dict-uk.ts                      # Ukrainian override
        uk/errors.dict-uk.ts                      # Ukrainian errors override
      i18n/imported/
        index.ts                                  # Imported DictGroup registration
        first/en/first.dict-en.ts                 # Overridden English for FirstDict
        first/uk/first.dict-uk.ts                 # Overridden Ukrainian for FirstDict
    third.module.ts                               # ThirdModule — custom DictService
    third/
      third.controller.ts                         # GET /third
      dict.service.ts                             # Custom DictService with Accept-Language
e2e/
  main.spec.ts                                    # End-to-end tests
```

## Testing

Run all tests (E2E):

```bash
cd examples/15*
yarn test
```
