# Prototypes

Screens sketched from Base UI, one file each. This folder is maintained by the ui-prototypes plugin for
Claude Code: ask it to make, change, open, list or delete a prototype.

```
cd web && pnpm proto
```

`http://localhost:6060/` lists the prototypes; `http://localhost:6060/<name>` opens one. An open page updates
itself when its file changes.

A prototype is `<name>.tsx` in this folder. It default-exports a component, and its first line is a comment saying
what it shows. It may import only `react`, `@base-ui/react` and files in this folder; `_*.tsx` files hold shared
fake data and are not prototypes. A prototype is a reference for a feature, not the feature: it makes no API calls.

`vite.config.mjs` serves them. Its `settings` block names the styles every prototype loads, the providers that wrap
it, and what it may import.

This folder is not type-checked (`tsconfig.json` excludes it) and not linted (`eslint.config.js` ignores it).

## The design system

[Base UI](https://base-ui.com) (`@base-ui/react`, formerly `@base-ui-components/react`): unstyled, accessible React
components. There is no project component library on top of it yet, and no theme: styling is separate work. Import
a component by name, either from the package root or from its subpath:

```tsx
import { Dialog } from '@base-ui/react/dialog';
import { Button, Field, Input } from '@base-ui/react';
```

Each component is a namespace of parts (`<Dialog.Root>`, `<Dialog.Trigger>`, `<Dialog.Popup>` …), except the
single-part ones (`Button`, `Input`). Every part renders one HTML element: change it with `render={<a />}`, and pass
`className` and `style` as usual. Parts expose their state as data attributes (`data-checked`, `data-disabled`,
`data-open`, `data-popup-open`, `data-invalid`, `data-highlighted`), the hooks for styling later.

Every prototype loads no global styles (the app has none yet) and is wrapped in no providers: Base UI needs none, and
a prototype makes no API calls, so the app's TanStack Query and router providers are not needed.

### Components

Props: the ones that change what a screen shows. Controlled variants (`value` with `onValueChange`, `checked` with
`onCheckedChange`, `open` with `onOpenChange`) exist for each `default*` prop below.

| Component | Parts | For | Props |
|---|---|---|---|
| `Button` | — | an action | `disabled`, `focusableWhenDisabled`, `render` |
| `Input` | — | a text input (inside `Field` for a label) | `defaultValue`, `placeholder`, `disabled`, `type` |
| `Field` | `Root`, `Label`, `Control`, `Description`, `Error`, `Validity` | a labelled form field with help and error text | Root: `invalid`, `disabled`, `name`, `validate`; Error: `match` (`"valueMissing"` …, or `true` to always show) |
| `Fieldset` | `Root`, `Legend` | a group of fields with a heading | Root: `disabled` |
| `Form` | — | a form that shows server errors on its fields | `errors` (`{ fieldName: 'message' }`), `onFormSubmit` |
| `Checkbox` | `Root`, `Indicator` | one on/off choice | Root: `defaultChecked`, `indeterminate`, `disabled`, `readOnly` |
| `CheckboxGroup` | — | several checkboxes with one value | `defaultValue` (string[]), `allValues` |
| `Radio`, `RadioGroup` | `Radio.Root`, `Radio.Indicator` | one of a few choices | RadioGroup: `defaultValue`, `disabled`; Radio.Root: `value` |
| `Switch` | `Root`, `Thumb` | a setting that applies at once | Root: `defaultChecked`, `disabled` |
| `Select` | `Root`, `Trigger`, `Value`, `Icon`, `Portal`, `Positioner`, `Popup`, `List`, `Item`, `ItemText`, `ItemIndicator`, `Group`, `GroupLabel`, `Separator` | one of many options in a popup | Root: `items` (`{ value, label }[]`), `defaultValue`, `multiple`, `disabled` |
| `Combobox` | `Root`, `Input`, `Trigger`, `Portal`, `Positioner`, `Popup`, `List`, `Item`, `Empty`, `Chips`, `Chip` | a searchable select, one or many | Root: `items`, `defaultValue`, `multiple` |
| `Autocomplete` | `Root`, `Input`, `Portal`, `Positioner`, `Popup`, `List`, `Item`, `Empty` | free text with suggestions | Root: `items` |
| `NumberField` | `Root`, `Group`, `Input`, `Increment`, `Decrement`, `ScrubArea` | a number with steppers | Root: `defaultValue`, `min`, `max`, `step`, `format` (Intl options) |
| `Slider` | `Root`, `Control`, `Track`, `Indicator`, `Thumb`, `Value` | a value or range on a scale | Root: `defaultValue` (number or [min, max]), `min`, `max`, `step` |
| `OTPField` | `Root`, `Input` | a one-time code | Root: `length` |
| `Toggle`, `ToggleGroup` | — | a pressed/unpressed button, or a set of them | Toggle: `defaultPressed`; ToggleGroup: `defaultValue`, `multiple` |
| `Tabs` | `Root`, `List`, `Tab`, `Indicator`, `Panel` | views of one thing | Root: `defaultValue`, `orientation`; Tab and Panel: `value` |
| `Accordion` | `Root`, `Item`, `Header`, `Trigger`, `Panel` | sections that open and close | Root: `defaultValue` (open items), `multiple`; Item: `value` |
| `Collapsible` | `Root`, `Trigger`, `Panel` | one section that opens and closes | Root: `defaultOpen` |
| `Dialog` | `Root`, `Trigger`, `Portal`, `Backdrop`, `Popup`, `Title`, `Description`, `Close` | a modal task | Root: `defaultOpen`, `modal` |
| `AlertDialog` | as `Dialog` | a confirmation that must be answered | Root: `defaultOpen` |
| `Drawer` | `Root`, `Trigger`, `Portal`, `Backdrop`, `Popup`, `Title`, `Description`, `Close` | a panel from a screen edge | Root: `defaultOpen` |
| `Popover` | `Root`, `Trigger`, `Portal`, `Positioner`, `Popup`, `Arrow`, `Title`, `Description`, `Close` | details or a small form next to a control | Root: `defaultOpen`; Positioner: `side`, `align`, `sideOffset` |
| `Tooltip` | `Provider`, `Root`, `Trigger`, `Portal`, `Positioner`, `Popup`, `Arrow` | a short label on hover | Root: `defaultOpen`; Positioner: `side` |
| `PreviewCard` | `Root`, `Trigger`, `Portal`, `Positioner`, `Popup` | a preview of a link on hover | Root: `defaultOpen` |
| `Menu` | `Root`, `Trigger`, `Portal`, `Positioner`, `Popup`, `Item`, `Separator`, `Group`, `GroupLabel`, `CheckboxItem`, `RadioGroup`, `RadioItem`, `SubmenuRoot`, `SubmenuTrigger` | actions in a dropdown | Root: `defaultOpen`; Item: `disabled` |
| `ContextMenu`, `Menubar` | as `Menu` | right-click actions; an app menu bar | — |
| `NavigationMenu` | `Root`, `List`, `Item`, `Trigger`, `Content`, `Link`, `Portal`, `Positioner`, `Popup`, `Viewport` | site navigation with dropdowns | Root: `defaultValue` |
| `Toolbar` | `Root`, `Button`, `Group`, `Separator`, `Link`, `Input` | a row of controls | Root: `orientation` |
| `Toast` | `Provider`, `Portal`, `Viewport`, `Root`, `Title`, `Description`, `Close`, `Action` | a passing notice (needs `Toast.Provider` and `Toast.useToastManager()`) | — |
| `Avatar` | `Root`, `Image`, `Fallback` | a person's picture or initials | Image: `src`; Fallback: `delay` |
| `Progress` | `Root`, `Label`, `Track`, `Indicator`, `Value` | how far a task is | Root: `value` (null = unknown), `min`, `max`, `format` |
| `Meter` | `Root`, `Label`, `Track`, `Indicator`, `Value` | a measured amount (storage used) | Root: `value`, `min`, `max` |
| `ScrollArea` | `Root`, `Viewport`, `Content`, `Scrollbar`, `Thumb` | a scrolling region | — |
| `Separator` | — | a divider | `orientation` |

### Tokens

None yet: no theme, colours, spacing or type scale (styling is separate work). Use plain elements (`main`,
`section`, `h1`–`h3`, `p`, `ul`, `table`) for structure, and an inline `style` only for layout: `display`,
`flexDirection`, `gap`, `gridTemplateColumns`, `maxWidth`, `padding`.

### Patterns

The app has one screen so far (`src/Home.tsx`): a `main` with an `h1` and one line of text, in three states
(loading, error, data). Show the same states in a prototype: data that breaks the layout, an empty state, and an
error. `example.tsx` composes a page with a header, tabs, a list, a form in a dialog, and an empty state.
