"use client";

import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type ControlledFieldProps<T extends FieldValues> = {
  name: Path<T>;
  control: Control<T>;
  label: string;
  inputProps?: React.ComponentProps<typeof Input>;
};

// This wraps the Controller + Field + Input + FieldError wiring that every RHF form in this
// app was repeating field by field (see user-form-dialog.tsx and login-form.tsx before this).
// Generic over the form's value type, so any react-hook-form `control` can use it as-is.
export function ControlledField<T extends FieldValues>({
  name,
  control,
  label,
  inputProps,
}: ControlledFieldProps<T>) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
          <Input {...field} {...inputProps} id={field.name} aria-invalid={fieldState.invalid} />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
