import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { CircleHelp } from "lucide-react";

import { RightDrawer } from "@/components/primitives/RightDrawer";
import { DrawerBody, DrawerHeader } from "@/components/console/detail";
import { AUTHSEC_TERMS, IGA_TERMS, OPEN_GLOSSARY_EVENT, openGlossary } from "./glossary";

/**
 * The glossary panel: the console's words in plain language, for the product
 * you are in. Mounted once (by the user menu, which both consoles render) and
 * opened from anywhere with `openGlossary()`.
 */
export function GlossaryDrawer() {
  const [open, setOpen] = useState(false);
  const isIga = useLocation().pathname.startsWith("/iga");
  const terms = isIga ? IGA_TERMS : AUTHSEC_TERMS;

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_GLOSSARY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_GLOSSARY_EVENT, onOpen);
  }, []);

  return (
    <RightDrawer
      open={open}
      onClose={() => setOpen(false)}
      width={420}
      ariaTitle="Glossary"
      ariaDescription={`The words ${isIga ? "Agentic IGA" : "AuthSec"} uses, in plain language.`}
    >
      <DrawerHeader
        title="Glossary"
        subtitle={`The words ${isIga ? "Agentic IGA" : "AuthSec"} uses, in plain language.`}
      />
      <DrawerBody>
        <dl className="m-0 space-y-4">
          {terms.map((t) => (
            <div key={t.term}>
              <dt className="text-[13.5px] font-semibold text-foreground">{t.term}</dt>
              <dd className="m-0 mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{t.meaning}</dd>
            </div>
          ))}
        </dl>
      </DrawerBody>
    </RightDrawer>
  );
}

/**
 * "Glossary" as a header button. No layout renders a top bar any more, so
 * nothing uses this; kept for now. It opens the panel `GlossaryDrawer`
 * mounts, so it must not mount a second one.
 */
export function GlossaryButton() {
  return (
    <button
      type="button"
      onClick={openGlossary}
      className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13.5px] font-medium text-(--color-text-muted) transition-colors hover:bg-(--color-hover) hover:text-(--color-text)"
    >
      <CircleHelp className="size-4" aria-hidden />
      <span className="hidden sm:inline">Glossary</span>
      <span className="sr-only sm:hidden">Glossary</span>
    </button>
  );
}
