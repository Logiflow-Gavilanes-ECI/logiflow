# UML Diagrams — LogiFlow Architecture

This folder contains the UML diagrams referenced from `docs/LogiFlow-architecture.tex`.

## Expected files

The LaTeX document expects the following PNG files (300 DPI recommended for print quality):

| File | Diagram type | Section in LaTeX | Eraser AI prompt |
|---|---|---|---|
| `01-context.png` | C4 Context | §6.1 | [01-context.prompt.md](01-context.prompt.md) |
| `02-components.png` | C4 Components | §6.2 | [02-components.prompt.md](02-components.prompt.md) |
| `03-classes.png` | UML Class | §6.3 | [03-classes.prompt.md](03-classes.prompt.md) |
| `04-er.png` | Entity-Relationship | §6.4 | [04-er.prompt.md](04-er.prompt.md) |
| `05-sequence.png` | UML Sequence | §6.5 | [05-sequence.prompt.md](05-sequence.prompt.md) |
| `06-deployment.png` | UML Deployment | §6.6 | [06-deployment.prompt.md](06-deployment.prompt.md) |
| `07-activity.png` | UML Activity | §6.7 | [07-activity.prompt.md](07-activity.prompt.md) |

## How to generate

1. Open [eraser.io](https://eraser.io) (or any Mermaid/PlantUML/draw.io renderer).
2. Open each `*.prompt.md` file and paste its content into the diagram generator.
3. Export the result as PNG at 300 DPI and save it with the filename above.
4. Re-compile the LaTeX document (`pdflatex LogiFlow-architecture.tex`).

## Compiling the LaTeX document

```bash
cd docs/
pdflatex LogiFlow-architecture.tex
pdflatex LogiFlow-architecture.tex   # second pass for ToC, ListOfFigures, ListOfTables
```

Output: `LogiFlow-architecture.pdf`
