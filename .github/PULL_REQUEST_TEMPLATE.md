# Change summary

Describe the user-visible or hardware-visible outcome and why the current behavior is insufficient.

## Evidence

- Hardware/source reference:
- Focused regression:
- External conformance result or reason unavailable:
- Real-ROM smoke impact:

## Checklist

- [ ] The change has one coherent purpose.
- [ ] Architecture ownership and dependency direction are preserved.
- [ ] New runtime state defines power-on/reset and save/restore behavior.
- [ ] Unsupported hardware fails explicitly instead of being approximated.
- [ ] Relevant documentation and compatibility evidence are updated.
- [ ] No ROM, generated output, credential or unrelated local change is included.
- [ ] `yarn quality` passes.
- [ ] `yarn build` passes.
