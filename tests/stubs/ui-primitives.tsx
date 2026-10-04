/**
 * Test double for `@deepseek-ai/dsh-client-ui-primitives`.
 *
 * The real package publishes one flat ESM bundle whose imports include
 * `shiki`, `katex`, `mdast-*`, `micromark-*`, `diff`, `anser`, and
 * `simple-icons`, plus its own CSS modules, and it declares none of them: it
 * is meant to be tree-shaken by the Web shell's bundler, which then serves the
 * result to every plugin through the shared module table. Nothing outside that
 * bundler can import it, so the panel's tests resolve the bare specifier here.
 *
 * The panel's *types* still come from the real package (it is a dev
 * dependency, and `tsc` checks every prop against its declarations), so this
 * file only has to reproduce the DOM contract the tests query. Each component
 * below mirrors the published implementation, including where a prop lands:
 * `Input` puts `className` on its wrapper and spreads the input attributes
 * onto the native input, exactly as the real one does.
 *
 * Keep this in step with the package when a primitive is added or its markup
 * changes; a divergence here shows up as a green test over a broken panel.
 */

import * as React from 'react'

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'toolbar'
export type TagTone = 'outline' | 'solid' | 'neutral' | 'quiet' | 'success' | 'info' | 'warning' | 'danger'
export type StateDotState = 'done' | 'warning' | 'ongoing' | 'error' | 'idle'

interface LabelledProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  title?: string
  className?: string
}

/** Real: `label` wrapping a native checkbox plus the visible copy. */
export function Checkbox({ checked, onChange, label, disabled = false, title, className }: LabelledProps): React.JSX.Element {
  return (
    <label className={className} title={title}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={event => { onChange(event.target.checked) }} />
      <span>{label}</span>
    </label>
  )
}

/** Real: a `role="switch"` button that owns its own `aria-label`. */
export function Switch({ checked, onChange, label, disabled = false, title, className }: LabelledProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      className={className}
      onClick={() => { onChange(!checked) }}
    />
  )
}

/** Real: `<span data-tone>`; the tone drives the palette, never the geometry. */
export function Tag({ tone = 'outline', className, children }: { tone?: TagTone; className?: string; children?: React.ReactNode }): React.JSX.Element {
  return <span className={className} data-tone={tone}>{children}</span>
}

/** Real: a decorative status glyph; the state drives its colour only. */
export function StateDot({ state, size, className }: { state: StateDotState; size?: number; className?: string }): React.JSX.Element {
  return <span className={className} data-state={state} data-size={size} aria-hidden="true" />
}

export const Button = React.forwardRef(function Button(
  { variant = 'ghost', size = 'md', icon, className, children, ...rest }:
  { variant?: ButtonVariant; size?: 'md' | 'sm'; icon?: React.ReactNode; className?: string; children?: React.ReactNode }
  & React.ButtonHTMLAttributes<HTMLButtonElement>,
  ref: React.Ref<HTMLButtonElement>,
): React.JSX.Element {
  return (
    <button ref={ref} type="button" className={className} data-variant={variant} data-size={size} {...rest}>
      {icon != null && <span>{icon}</span>}
      {children}
    </button>
  )
})

/** Real: `className` lands on an inline-flex wrapper; the attributes land on the input. */
export const Input = React.forwardRef(function Input(
  { icon, className, ...rest }: { icon?: React.ReactNode; className?: string } & React.InputHTMLAttributes<HTMLInputElement>,
  ref: React.Ref<HTMLInputElement>,
): React.JSX.Element {
  return (
    <span className={className}>
      {icon != null && <span>{icon}</span>}
      <input ref={ref} {...rest} />
    </span>
  )
})

export interface SegmentedControlOption<Value extends string> {
  value: Value
  label: string
  disabled?: boolean
  title?: string
}

/** Real: a `role="tablist"` of `role="tab"` buttons carrying `aria-selected`. */
export function SegmentedControl<Value extends string>({ id, value, options, onChange, label, disabled = false, className }: {
  id: string
  value: Value
  options: readonly SegmentedControlOption<Value>[]
  onChange: (next: Value) => void
  label: string
  disabled?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <div role="tablist" aria-label={label} className={className}>
      {options.map(option => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            id={`${id}-${option.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${id}-${option.value}-panel`}
            tabIndex={active ? 0 : -1}
            disabled={disabled || option.disabled === true}
            title={option.title}
            onClick={() => { if (!active) onChange(option.value) }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
