/** Shared width for SC / OC create+edit (dialog and page). Overrides DialogContent `max-w-lg`. */
export const PROCUREMENT_FORM_DIALOG_CLASS =
  "max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto overscroll-contain [&>button]:right-2 [&>button]:top-2 [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center";

export const PROCUREMENT_FORM_PAGE_CLASS = "mx-auto w-full min-w-0 max-w-4xl";

/** Keep the existing input/select components, with the same density in every purchase form. */
export const PROCUREMENT_FORM_FIELDS_CLASS =
  "min-w-0 [&_input:not([type=checkbox]):not([type=radio]):not([type=hidden])]:min-h-11 [&_input:not([type=checkbox]):not([type=radio]):not([type=hidden])]:min-w-0 md:[&_input:not([type=checkbox]):not([type=radio]):not([type=hidden])]:min-h-10 [&_button[role=combobox]]:min-h-11 md:[&_button[role=combobox]]:min-h-10 [&_select]:min-h-11 md:[&_select]:min-h-10 [&_textarea]:min-h-11 md:[&_textarea]:min-h-10 [&_input[inputmode=decimal]]:text-right [&_input[inputmode=decimal]]:tabular-nums";

/** Shared mobile action bar; desktop actions remain in the normal document flow. */
export const PROCUREMENT_FORM_ACTIONS_CLASS =
  "sticky bottom-0 z-20 -mx-1 flex flex-col-reverse gap-2 border-t bg-background/95 p-3 backdrop-blur sm:flex-row sm:flex-wrap sm:justify-end md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none [&>button]:h-auto [&>button]:min-h-11 [&>button]:whitespace-normal [&>button]:py-2 md:[&>button]:min-h-10";
