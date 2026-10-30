const {
	Plugin,
	PluginSettingTab,
	Setting,
	Modal,
	Notice,
	MarkdownView,
	TFile,
	normalizePath,
	parseLinktext,
	resolveSubpath,
	stripHeading,
	moment,
	addIcon,
	setIcon
} = require("obsidian");

const DEFAULT_SETTINGS = {
	exportFolder: "Exportações em texto",
	preserveSourceFolders: false,
	preserveHeadings: true,
	preserveLists: true,
	collapseBlankLines: true,
	expandEmbeddedNotes: true,
	indicateMissingEmbeds: true
};

const MAX_EMBED_DEPTH = 50;
const MAX_BATCH_DESTINATION_RETRIES = 3;
const EMBED_PATTERN = /!\[\[([^\]\n]+)\]\]/g;

function registerExportPaletteIcons() {
	addIcon(
		"tiago7-pte-single-page",
		`<path d="M28 12h30l14 14v62H28z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><path d="M58 12v18h18" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/>`
	);
	addIcon(
		"tiago7-pte-multi-page",
		`<path d="M20 24h34l14 14v50H20z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><path d="M54 24v18h18" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><path d="M32 12h34l14 14v50" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
	);
	addIcon(
		"tiago7-pte-page-check",
		`<path d="M20 24h34l14 14v50H20z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><path d="M54 24v18h18" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><path d="M32 12h34l14 14v50" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 61l9 9 18-20" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`
	);
	addIcon(
		"tiago7-pte-cancel-page",
		`<path d="M24 12h34l14 14v62H24z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><path d="M58 12v18h18" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><path d="M38 50l22 22M60 50L38 72" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>`
	);
}

const I18N = {
  "en": {
    "cleanExportTitle": "Export clean text",
    "cleanExportDesc": "Removes Markdown formatting and tiago7 color codes while preserving headings, [ ] boxes, and vertical bars |.",
    "selectedNote": "Selected note",
    "selectedNoteAria": "Selected note: {name}",
    "singleExportName": "Single export",
    "singleExportDesc": "Creates or updates a clean copy inside the vault.",
    "exportButton": "Export",
    "exportButtonAria": "Export the selected note as a clean .txt file",
    "copyTransferName": "Copy to clipboard",
    "copyTransferDesc": "Copies the result so you can paste it into chats, emails, or other apps.",
    "copyButton": "Copy",
    "copyButtonAria": "Copy the selected note as clean text",
    "batchExportName": "Batch export",
    "batchExportDesc": "Choose multiple notes from the vault and export them all at once.",
    "selectNotesButton": "Select notes",
    "selectNotesButtonAria": "Open note selection for batch export",
    "multiTitle": "Batch export",
    "multiDesc": "Select the Markdown notes that will be converted into clean .txt files.",
    "searchPlaceholder": "Filter by name or folder…",
    "searchAria": "Filter notes by name or folder",
    "selectVisible": "Select visible",
    "selectVisibleAria": "Select all notes currently visible in the filtered list",
    "noteFolder": "Note folder",
    "noteFolderAria": "Select all notes in the active note folder",
    "clearSelection": "Clear selection",
    "clearSelectionAria": "Clear all selected notes",
    "cancel": "Cancel",
    "cancelAria": "Cancel batch export",
    "exportSelected": "Export selected",
    "exportSelectedAria": "Export the selected notes",
    "noNotesFound": "No notes found.",
    "fileCheckboxAria": "Select note {name}",
    "countSummary": "{selected} selected · {visible} visible · {total} in vault",
    "selectAtLeastOne": "Select at least one note.",
    "exporting": "Exporting…",
    "openMarkdownForFolder": "Open a Markdown note to select its folder.",
    "settingsExportFolderName": "Export folder",
    "settingsExportFolderDesc": "Folder inside the vault where .txt files will be created.",
    "settingsExportFolderAria": "Export folder path",
    "settingsExportFolderPlaceholder": "Text exports",
    "settingsExpandEmbedsName": "Expand embedded notes during export",
    "settingsExpandEmbedsDesc": "Replaces ![[Note]], ![[Note#Heading]], and ![[Note#^block]] with their real content during export. Vault notes are not modified.",
    "settingsMissingEmbedsName": "Indicate missing embeds",
    "settingsMissingEmbedsDesc": "When a note, section, or block does not exist, includes an indication in the exported text. When disabled, silently removes the invalid embed.",
    "settingsPreserveFoldersName": "Repeat note folder structure",
    "settingsPreserveFoldersDesc": "When disabled, all exported files are placed directly in the export folder.",
    "settingsPreserveHeadingsName": "Keep headings with #",
    "settingsPreserveHeadingsDesc": "Preserves #, ##, ###, and other levels to keep the visual hierarchy.",
    "settingsPreserveListsName": "Keep list markers",
    "settingsPreserveListsDesc": "Preserves -, *, +, and numbered lists because they remain readable in plain text.",
    "settingsCollapseBlankName": "Reduce blank lines",
    "settingsCollapseBlankDesc": "Limits empty intervals to a single blank line.",
    "ribbonTooltip": "Export clean text",

    "paletteAria": "Clean text export actions",
    "paletteSingleAria": "Export the current note as clean text",
    "paletteBatchStartAria": "Start selecting Markdown notes in the File Explorer",
    "paletteBatchExportAria": "Export {count} selected note(s)",
    "paletteCancelAria": "Cancel and clear the current batch selection",
    "batchModeEntered": "Selection mode active. Choose Markdown notes in the File Explorer.",
    "batchModeCanceled": "Batch selection canceled.",
    "batchSelectedCount": "{count} selected",
    "batchNoSelection": "Select at least one Markdown note.",
    "batchSelectionInvalid": "Selection changed: {count} unavailable note(s) were removed. Review the selection and confirm again.",
    "batchSourceChangedDuringExport": "A source note changed or became unavailable during export. That item was not exported.",
    "batchDestinationChangedDuringExport": "The export destination changed during the batch. This item was not exported to avoid overwriting another result.",
    "commandExportCurrent": "Export current note as clean text (.txt)",
    "commandCopyCurrent": "Copy current note as clean text",
    "commandOpenActions": "Open clean export options",
    "commandExportMultiple": "Batch export notes as clean text…",
    "notMarkdownError": "The selected item is not a Markdown note.",
    "currentNote": "current note",
    "attachmentEmbed": "[Embedded attachment: {name}]",
    "missingNoteEmbed": "[Embedded note not found: {name}]",
    "circularEmbed": "[Circular embed ignored: {name}]",
    "embedDepth": "[Embed limit reached: {name}]",
    "missingBlock": "[Embedded block not found: {name}]",
    "missingSection": "[Embedded section not found: {name}]",
    "batchSuccess": "{count} note(s) exported successfully.",
    "batchPartial": "{exported} exported; {failed} failed. See the console for details.",
    "openMarkdownBeforeExport": "Open a Markdown note before exporting.",
    "createFolderError": "Could not create folder: {path}",
    "folderCollision": "A folder already exists with the same name as the exported file.",
    "writeNotConfirmed": "Obsidian did not confirm file creation.",
    "verifyMismatch": "The file was created, but the saved content does not match the exported text.",
    "exportSuccess": "Clean text exported and verified: {path}",
    "exportFailure": "Export failed: {message}",
    "copySuccess": "Clean text copied.",
    "copyAutoFail": "Could not copy automatically.",
    "copyFailure": "Copy failed: {message}"
  },
  "pt-BR": {
    "cleanExportTitle": "Exportar texto limpo",
    "cleanExportDesc": "Remove formatação Markdown e códigos de cores tiago7, preservando títulos, caixas [ ] e barras verticais |.",
    "selectedNote": "Nota selecionada",
    "selectedNoteAria": "Nota selecionada: {name}",
    "singleExportName": "Exportação única",
    "singleExportDesc": "Cria ou atualiza uma cópia limpa dentro do vault.",
    "exportButton": "Exportar",
    "exportButtonAria": "Exportar a nota selecionada como arquivo .txt limpo",
    "copyTransferName": "Copiar para transferência",
    "copyTransferDesc": "Copia o resultado para colar em chats, e-mails ou outros aplicativos.",
    "copyButton": "Copiar",
    "copyButtonAria": "Copiar a nota selecionada como texto limpo",
    "batchExportName": "Exportar em lotes",
    "batchExportDesc": "Escolha várias notas do vault e exporte todas de uma vez.",
    "selectNotesButton": "Selecionar notas",
    "selectNotesButtonAria": "Abrir seleção de notas para exportação em lotes",
    "multiTitle": "Exportar em lotes",
    "multiDesc": "Selecione as notas Markdown que serão convertidas em arquivos .txt limpos.",
    "searchPlaceholder": "Filtrar por nome ou pasta…",
    "searchAria": "Filtrar notas por nome ou pasta",
    "selectVisible": "Selecionar visíveis",
    "selectVisibleAria": "Selecionar todas as notas visíveis na lista filtrada",
    "noteFolder": "Pasta da nota",
    "noteFolderAria": "Selecionar todas as notas da pasta da nota ativa",
    "clearSelection": "Limpar seleção",
    "clearSelectionAria": "Limpar todas as notas selecionadas",
    "cancel": "Cancelar",
    "cancelAria": "Cancelar exportação em lotes",
    "exportSelected": "Exportar selecionadas",
    "exportSelectedAria": "Exportar as notas selecionadas",
    "noNotesFound": "Nenhuma nota encontrada.",
    "fileCheckboxAria": "Selecionar nota {name}",
    "countSummary": "{selected} selecionada(s) · {visible} visível(is) · {total} no vault",
    "selectAtLeastOne": "Selecione pelo menos uma nota.",
    "exporting": "Exportando…",
    "openMarkdownForFolder": "Abra uma nota Markdown para selecionar a pasta dela.",
    "settingsExportFolderName": "Pasta de exportação",
    "settingsExportFolderDesc": "Pasta dentro do vault onde os arquivos .txt serão criados.",
    "settingsExportFolderAria": "Caminho da pasta de exportação",
    "settingsExportFolderPlaceholder": "Exportações em texto",
    "settingsExpandEmbedsName": "Expandir notas incorporadas na exportação",
    "settingsExpandEmbedsDesc": "Substitui ![[Nota]], ![[Nota#Cabeçalho]] e ![[Nota#^bloco]] pelo conteúdo real durante a exportação. As notas do vault não são modificadas.",
    "settingsMissingEmbedsName": "Indicar incorporações não encontradas",
    "settingsMissingEmbedsDesc": "Quando uma nota, seção ou bloco não existe, inclui uma indicação no texto exportado. Se desativado, remove silenciosamente a incorporação inválida.",
    "settingsPreserveFoldersName": "Repetir estrutura de pastas da nota",
    "settingsPreserveFoldersDesc": "Se desativado, todos os arquivos exportados ficam diretamente na pasta de exportação.",
    "settingsPreserveHeadingsName": "Manter títulos com #",
    "settingsPreserveHeadingsDesc": "Preserva #, ##, ### e outros níveis para manter a hierarquia visual.",
    "settingsPreserveListsName": "Manter marcadores de listas",
    "settingsPreserveListsDesc": "Preserva -, *, + e listas numeradas porque continuam legíveis em texto puro.",
    "settingsCollapseBlankName": "Reduzir linhas em branco",
    "settingsCollapseBlankDesc": "Limita intervalos vazios a uma única linha em branco.",
    "ribbonTooltip": "Exportar texto limpo",

    "paletteAria": "Ações de exportação de texto limpo",
    "paletteSingleAria": "Exportar a nota atual como texto limpo",
    "paletteBatchStartAria": "Começar a selecionar notas Markdown no Explorador de arquivos",
    "paletteBatchExportAria": "Exportar {count} nota(s) selecionada(s)",
    "paletteCancelAria": "Cancelar e limpar a seleção atual em lote",
    "batchModeEntered": "Modo de seleção ativo. Escolha notas Markdown no Explorador de arquivos.",
    "batchModeCanceled": "Seleção em lote cancelada.",
    "batchSelectedCount": "{count} selecionada(s)",
    "batchNoSelection": "Selecione pelo menos uma nota Markdown.",
    "batchSelectionInvalid": "A seleção mudou: {count} nota(s) indisponível(is) foram removidas. Revise a seleção e confirme novamente.",
    "batchSourceChangedDuringExport": "Uma nota de origem mudou ou ficou indisponível durante a exportação. Esse item não foi exportado.",
    "batchDestinationChangedDuringExport": "O destino de exportação mudou durante o lote. Esse item não foi exportado para evitar sobrescrever outro resultado.",
    "commandExportCurrent": "Exportar nota atual como texto limpo (.txt)",
    "commandCopyCurrent": "Copiar nota atual como texto limpo",
    "commandOpenActions": "Abrir opções de exportação limpa",
    "commandExportMultiple": "Exportar notas em lotes como texto limpo…",
    "notMarkdownError": "O item selecionado não é uma nota Markdown.",
    "currentNote": "nota atual",
    "attachmentEmbed": "[Anexo incorporado: {name}]",
    "missingNoteEmbed": "[Nota incorporada não encontrada: {name}]",
    "circularEmbed": "[Incorporação circular ignorada: {name}]",
    "embedDepth": "[Limite de incorporações atingido: {name}]",
    "missingBlock": "[Bloco incorporado não encontrado: {name}]",
    "missingSection": "[Seção incorporada não encontrada: {name}]",
    "batchSuccess": "{count} nota(s) exportada(s) com sucesso.",
    "batchPartial": "{exported} exportada(s); {failed} falharam. Veja o console para detalhes.",
    "openMarkdownBeforeExport": "Abra uma nota Markdown antes de exportar.",
    "createFolderError": "Não foi possível criar a pasta: {path}",
    "folderCollision": "Já existe uma pasta com o mesmo nome do arquivo exportado.",
    "writeNotConfirmed": "O Obsidian não confirmou a criação do arquivo.",
    "verifyMismatch": "O arquivo foi criado, mas o conteúdo gravado não corresponde ao texto exportado.",
    "exportSuccess": "Texto limpo exportado e verificado: {path}",
    "exportFailure": "Falha ao exportar: {message}",
    "copySuccess": "Texto limpo copiado.",
    "copyAutoFail": "Não foi possível copiar automaticamente.",
    "copyFailure": "Falha ao copiar: {message}"
  },
  "es": {
    "cleanExportTitle": "Exportar texto limpio",
    "cleanExportDesc": "Elimina el formato Markdown y los códigos de color de tiago7, conservando títulos, casillas [ ] y barras verticales |.",
    "selectedNote": "Nota seleccionada",
    "selectedNoteAria": "Nota seleccionada: {name}",
    "singleExportName": "Exportación única",
    "singleExportDesc": "Crea o actualiza una copia limpia dentro del vault.",
    "exportButton": "Exportar",
    "exportButtonAria": "Exportar la nota seleccionada como archivo .txt limpio",
    "copyTransferName": "Copiar al portapapeles",
    "copyTransferDesc": "Copia el resultado para pegarlo en chats, correos u otras aplicaciones.",
    "copyButton": "Copiar",
    "copyButtonAria": "Copiar la nota seleccionada como texto limpio",
    "batchExportName": "Exportar por lotes",
    "batchExportDesc": "Elige varias notas del vault y expórtalas todas de una vez.",
    "selectNotesButton": "Seleccionar notas",
    "selectNotesButtonAria": "Abrir selección de notas para exportación por lotes",
    "multiTitle": "Exportar por lotes",
    "multiDesc": "Selecciona las notas Markdown que se convertirán en archivos .txt limpios.",
    "searchPlaceholder": "Filtrar por nombre o carpeta…",
    "searchAria": "Filtrar notas por nombre o carpeta",
    "selectVisible": "Seleccionar visibles",
    "selectVisibleAria": "Seleccionar todas las notas visibles de la lista filtrada",
    "noteFolder": "Carpeta de la nota",
    "noteFolderAria": "Seleccionar todas las notas de la carpeta de la nota activa",
    "clearSelection": "Limpiar selección",
    "clearSelectionAria": "Quitar todas las notas seleccionadas",
    "cancel": "Cancelar",
    "cancelAria": "Cancelar exportación por lotes",
    "exportSelected": "Exportar seleccionadas",
    "exportSelectedAria": "Exportar las notas seleccionadas",
    "noNotesFound": "No se encontraron notas.",
    "fileCheckboxAria": "Seleccionar nota {name}",
    "countSummary": "{selected} seleccionada(s) · {visible} visible(s) · {total} en el vault",
    "selectAtLeastOne": "Selecciona al menos una nota.",
    "exporting": "Exportando…",
    "openMarkdownForFolder": "Abre una nota Markdown para seleccionar su carpeta.",
    "settingsExportFolderName": "Carpeta de exportación",
    "settingsExportFolderDesc": "Carpeta dentro del vault donde se crearán los archivos .txt.",
    "settingsExportFolderAria": "Ruta de la carpeta de exportación",
    "settingsExportFolderPlaceholder": "Exportaciones de texto",
    "settingsExpandEmbedsName": "Expandir notas incrustadas al exportar",
    "settingsExpandEmbedsDesc": "Sustituye ![[Nota]], ![[Nota#Encabezado]] y ![[Nota#^bloque]] por su contenido real durante la exportación. Las notas del vault no se modifican.",
    "settingsMissingEmbedsName": "Indicar incrustaciones no encontradas",
    "settingsMissingEmbedsDesc": "Cuando una nota, sección o bloque no existe, incluye una indicación en el texto exportado. Si se desactiva, elimina silenciosamente la incrustación inválida.",
    "settingsPreserveFoldersName": "Repetir estructura de carpetas de la nota",
    "settingsPreserveFoldersDesc": "Si se desactiva, todos los archivos exportados quedan directamente en la carpeta de exportación.",
    "settingsPreserveHeadingsName": "Conservar títulos con #",
    "settingsPreserveHeadingsDesc": "Conserva #, ##, ### y otros niveles para mantener la jerarquía visual.",
    "settingsPreserveListsName": "Conservar marcadores de lista",
    "settingsPreserveListsDesc": "Conserva -, *, + y listas numeradas porque siguen siendo legibles en texto plano.",
    "settingsCollapseBlankName": "Reducir líneas en blanco",
    "settingsCollapseBlankDesc": "Limita los intervalos vacíos a una sola línea en blanco.",
    "ribbonTooltip": "Exportar texto limpio",

    "paletteAria": "Acciones de exportación de texto limpio",
    "paletteSingleAria": "Exportar la nota actual como texto limpio",
    "paletteBatchStartAria": "Empezar a seleccionar notas Markdown en el Explorador de archivos",
    "paletteBatchExportAria": "Exportar {count} nota(s) seleccionada(s)",
    "paletteCancelAria": "Cancelar y borrar la selección por lotes actual",
    "batchModeEntered": "Modo de selección activo. Elige notas Markdown en el Explorador de archivos.",
    "batchModeCanceled": "Selección por lotes cancelada.",
    "batchSelectedCount": "{count} seleccionada(s)",
    "batchNoSelection": "Selecciona al menos una nota Markdown.",
    "batchSelectionInvalid": "La selección cambió: se eliminaron {count} nota(s) no disponible(s). Revisa la selección y confirma de nuevo.",
    "batchSourceChangedDuringExport": "Una nota de origen cambió o dejó de estar disponible durante la exportación. Ese elemento no se exportó.",
    "batchDestinationChangedDuringExport": "El destino de exportación cambió durante el lote. Ese elemento no se exportó para evitar sobrescribir otro resultado.",
    "commandExportCurrent": "Exportar nota actual como texto limpio (.txt)",
    "commandCopyCurrent": "Copiar nota actual como texto limpio",
    "commandOpenActions": "Abrir opciones de exportación limpia",
    "commandExportMultiple": "Exportar notas por lotes como texto limpio…",
    "notMarkdownError": "El elemento seleccionado no es una nota Markdown.",
    "currentNote": "nota actual",
    "attachmentEmbed": "[Adjunto incrustado: {name}]",
    "missingNoteEmbed": "[Nota incrustada no encontrada: {name}]",
    "circularEmbed": "[Incrustación circular ignorada: {name}]",
    "embedDepth": "[Límite de incrustaciones alcanzado: {name}]",
    "missingBlock": "[Bloque incrustado no encontrado: {name}]",
    "missingSection": "[Sección incrustada no encontrada: {name}]",
    "batchSuccess": "{count} nota(s) exportada(s) correctamente.",
    "batchPartial": "{exported} exportada(s); {failed} fallaron. Consulta la consola para más detalles.",
    "openMarkdownBeforeExport": "Abre una nota Markdown antes de exportar.",
    "createFolderError": "No se pudo crear la carpeta: {path}",
    "folderCollision": "Ya existe una carpeta con el mismo nombre que el archivo exportado.",
    "writeNotConfirmed": "Obsidian no confirmó la creación del archivo.",
    "verifyMismatch": "El archivo se creó, pero el contenido guardado no coincide con el texto exportado.",
    "exportSuccess": "Texto limpio exportado y verificado: {path}",
    "exportFailure": "Error al exportar: {message}",
    "copySuccess": "Texto limpio copiado.",
    "copyAutoFail": "No se pudo copiar automáticamente.",
    "copyFailure": "Error al copiar: {message}"
  },
  "fr": {
    "cleanExportTitle": "Exporter le texte nettoyé",
    "cleanExportDesc": "Supprime la mise en forme Markdown et les codes couleur tiago7 tout en conservant les titres, les cases [ ] et les barres verticales |.",
    "selectedNote": "Note sélectionnée",
    "selectedNoteAria": "Note sélectionnée : {name}",
    "singleExportName": "Export unique",
    "singleExportDesc": "Crée ou met à jour une copie nettoyée dans le coffre.",
    "exportButton": "Exporter",
    "exportButtonAria": "Exporter la note sélectionnée en fichier .txt nettoyé",
    "copyTransferName": "Copier dans le presse-papiers",
    "copyTransferDesc": "Copie le résultat pour le coller dans des chats, e-mails ou autres applications.",
    "copyButton": "Copier",
    "copyButtonAria": "Copier la note sélectionnée en texte nettoyé",
    "batchExportName": "Export par lots",
    "batchExportDesc": "Choisissez plusieurs notes du coffre et exportez-les en une seule fois.",
    "selectNotesButton": "Sélectionner les notes",
    "selectNotesButtonAria": "Ouvrir la sélection de notes pour l’export par lots",
    "multiTitle": "Export par lots",
    "multiDesc": "Sélectionnez les notes Markdown qui seront converties en fichiers .txt nettoyés.",
    "searchPlaceholder": "Filtrer par nom ou dossier…",
    "searchAria": "Filtrer les notes par nom ou dossier",
    "selectVisible": "Sélectionner visibles",
    "selectVisibleAria": "Sélectionner toutes les notes visibles dans la liste filtrée",
    "noteFolder": "Dossier de la note",
    "noteFolderAria": "Sélectionner toutes les notes du dossier de la note active",
    "clearSelection": "Effacer la sélection",
    "clearSelectionAria": "Effacer toutes les notes sélectionnées",
    "cancel": "Annuler",
    "cancelAria": "Annuler l’export par lots",
    "exportSelected": "Exporter la sélection",
    "exportSelectedAria": "Exporter les notes sélectionnées",
    "noNotesFound": "Aucune note trouvée.",
    "fileCheckboxAria": "Sélectionner la note {name}",
    "countSummary": "{selected} sélectionnée(s) · {visible} visible(s) · {total} dans le coffre",
    "selectAtLeastOne": "Sélectionnez au moins une note.",
    "exporting": "Exportation…",
    "openMarkdownForFolder": "Ouvrez une note Markdown pour sélectionner son dossier.",
    "settingsExportFolderName": "Dossier d’export",
    "settingsExportFolderDesc": "Dossier du coffre où les fichiers .txt seront créés.",
    "settingsExportFolderAria": "Chemin du dossier d’export",
    "settingsExportFolderPlaceholder": "Exports texte",
    "settingsExpandEmbedsName": "Développer les notes intégrées à l’export",
    "settingsExpandEmbedsDesc": "Remplace ![[Note]], ![[Note#Titre]] et ![[Note#^bloc]] par leur contenu réel pendant l’export. Les notes du coffre ne sont pas modifiées.",
    "settingsMissingEmbedsName": "Indiquer les intégrations introuvables",
    "settingsMissingEmbedsDesc": "Lorsqu’une note, section ou bloc n’existe pas, ajoute une indication au texte exporté. Si désactivé, supprime silencieusement l’intégration invalide.",
    "settingsPreserveFoldersName": "Reproduire la structure des dossiers",
    "settingsPreserveFoldersDesc": "Si désactivé, tous les fichiers exportés sont placés directement dans le dossier d’export.",
    "settingsPreserveHeadingsName": "Conserver les titres avec #",
    "settingsPreserveHeadingsDesc": "Conserve #, ##, ### et les autres niveaux pour maintenir la hiérarchie visuelle.",
    "settingsPreserveListsName": "Conserver les marqueurs de liste",
    "settingsPreserveListsDesc": "Conserve -, *, + et les listes numérotées car elles restent lisibles en texte brut.",
    "settingsCollapseBlankName": "Réduire les lignes vides",
    "settingsCollapseBlankDesc": "Limite les intervalles vides à une seule ligne vide.",
    "ribbonTooltip": "Exporter le texte nettoyé",

    "paletteAria": "Actions d’export de texte propre",
    "paletteSingleAria": "Exporter la note active en texte propre",
    "paletteBatchStartAria": "Commencer à sélectionner des notes Markdown dans l’explorateur de fichiers",
    "paletteBatchExportAria": "Exporter {count} note(s) sélectionnée(s)",
    "paletteCancelAria": "Annuler et effacer la sélection par lot actuelle",
    "batchModeEntered": "Mode de sélection actif. Choisissez des notes Markdown dans l’explorateur de fichiers.",
    "batchModeCanceled": "Sélection par lot annulée.",
    "batchSelectedCount": "{count} sélectionnée(s)",
    "batchNoSelection": "Sélectionnez au moins une note Markdown.",
    "batchSelectionInvalid": "La sélection a changé : {count} note(s) indisponible(s) ont été retirées. Vérifiez la sélection et confirmez à nouveau.",
    "batchSourceChangedDuringExport": "Une note source a changé ou est devenue indisponible pendant l’exportation. Cet élément n’a pas été exporté.",
    "batchDestinationChangedDuringExport": "La destination d’exportation a changé pendant le lot. Cet élément n’a pas été exporté afin d’éviter d’écraser un autre résultat.",
    "commandExportCurrent": "Exporter la note actuelle en texte nettoyé (.txt)",
    "commandCopyCurrent": "Copier la note actuelle en texte nettoyé",
    "commandOpenActions": "Ouvrir les options d’export nettoyé",
    "commandExportMultiple": "Exporter des notes par lots en texte nettoyé…",
    "notMarkdownError": "L’élément sélectionné n’est pas une note Markdown.",
    "currentNote": "note actuelle",
    "attachmentEmbed": "[Pièce jointe intégrée : {name}]",
    "missingNoteEmbed": "[Note intégrée introuvable : {name}]",
    "circularEmbed": "[Intégration circulaire ignorée : {name}]",
    "embedDepth": "[Limite d’intégrations atteinte : {name}]",
    "missingBlock": "[Bloc intégré introuvable : {name}]",
    "missingSection": "[Section intégrée introuvable : {name}]",
    "batchSuccess": "{count} note(s) exportée(s) avec succès.",
    "batchPartial": "{exported} exportée(s) ; {failed} ont échoué. Consultez la console pour plus de détails.",
    "openMarkdownBeforeExport": "Ouvrez une note Markdown avant d’exporter.",
    "createFolderError": "Impossible de créer le dossier : {path}",
    "folderCollision": "Un dossier portant le même nom que le fichier exporté existe déjà.",
    "writeNotConfirmed": "Obsidian n’a pas confirmé la création du fichier.",
    "verifyMismatch": "Le fichier a été créé, mais le contenu enregistré ne correspond pas au texte exporté.",
    "exportSuccess": "Texte nettoyé exporté et vérifié : {path}",
    "exportFailure": "Échec de l’export : {message}",
    "copySuccess": "Texte nettoyé copié.",
    "copyAutoFail": "Impossible de copier automatiquement.",
    "copyFailure": "Échec de la copie : {message}"
  },
  "de": {
    "cleanExportTitle": "Bereinigten Text exportieren",
    "cleanExportDesc": "Entfernt Markdown-Formatierung und tiago7-Farbcodes, behält aber Überschriften, [ ]-Kästchen und senkrechte Striche | bei.",
    "selectedNote": "Ausgewählte Notiz",
    "selectedNoteAria": "Ausgewählte Notiz: {name}",
    "singleExportName": "Einzelexport",
    "singleExportDesc": "Erstellt oder aktualisiert eine bereinigte Kopie im Vault.",
    "exportButton": "Exportieren",
    "exportButtonAria": "Ausgewählte Notiz als bereinigte .txt-Datei exportieren",
    "copyTransferName": "In die Zwischenablage kopieren",
    "copyTransferDesc": "Kopiert das Ergebnis zum Einfügen in Chats, E-Mails oder andere Apps.",
    "copyButton": "Kopieren",
    "copyButtonAria": "Ausgewählte Notiz als bereinigten Text kopieren",
    "batchExportName": "Stapelexport",
    "batchExportDesc": "Mehrere Notizen aus dem Vault auswählen und gemeinsam exportieren.",
    "selectNotesButton": "Notizen auswählen",
    "selectNotesButtonAria": "Notizauswahl für den Stapelexport öffnen",
    "multiTitle": "Stapelexport",
    "multiDesc": "Wählen Sie die Markdown-Notizen aus, die in bereinigte .txt-Dateien umgewandelt werden.",
    "searchPlaceholder": "Nach Name oder Ordner filtern…",
    "searchAria": "Notizen nach Name oder Ordner filtern",
    "selectVisible": "Sichtbare auswählen",
    "selectVisibleAria": "Alle aktuell sichtbaren Notizen in der gefilterten Liste auswählen",
    "noteFolder": "Notizordner",
    "noteFolderAria": "Alle Notizen im Ordner der aktiven Notiz auswählen",
    "clearSelection": "Auswahl löschen",
    "clearSelectionAria": "Alle ausgewählten Notizen abwählen",
    "cancel": "Abbrechen",
    "cancelAria": "Stapelexport abbrechen",
    "exportSelected": "Ausgewählte exportieren",
    "exportSelectedAria": "Ausgewählte Notizen exportieren",
    "noNotesFound": "Keine Notizen gefunden.",
    "fileCheckboxAria": "Notiz {name} auswählen",
    "countSummary": "{selected} ausgewählt · {visible} sichtbar · {total} im Vault",
    "selectAtLeastOne": "Wählen Sie mindestens eine Notiz aus.",
    "exporting": "Export läuft…",
    "openMarkdownForFolder": "Öffnen Sie eine Markdown-Notiz, um deren Ordner auszuwählen.",
    "settingsExportFolderName": "Exportordner",
    "settingsExportFolderDesc": "Ordner im Vault, in dem .txt-Dateien erstellt werden.",
    "settingsExportFolderAria": "Pfad des Exportordners",
    "settingsExportFolderPlaceholder": "Textexporte",
    "settingsExpandEmbedsName": "Eingebettete Notizen beim Export erweitern",
    "settingsExpandEmbedsDesc": "Ersetzt ![[Notiz]], ![[Notiz#Überschrift]] und ![[Notiz#^Block]] beim Export durch den tatsächlichen Inhalt. Die Vault-Notizen werden nicht verändert.",
    "settingsMissingEmbedsName": "Fehlende Einbettungen kennzeichnen",
    "settingsMissingEmbedsDesc": "Wenn eine Notiz, ein Abschnitt oder Block nicht existiert, wird im exportierten Text ein Hinweis eingefügt. Wenn deaktiviert, wird die ungültige Einbettung still entfernt.",
    "settingsPreserveFoldersName": "Ordnerstruktur der Notiz wiederholen",
    "settingsPreserveFoldersDesc": "Wenn deaktiviert, werden alle exportierten Dateien direkt im Exportordner abgelegt.",
    "settingsPreserveHeadingsName": "Überschriften mit # beibehalten",
    "settingsPreserveHeadingsDesc": "Behält #, ##, ### und weitere Ebenen bei, um die visuelle Hierarchie zu erhalten.",
    "settingsPreserveListsName": "Listenmarkierungen beibehalten",
    "settingsPreserveListsDesc": "Behält -, *, + und nummerierte Listen bei, da sie im Klartext lesbar bleiben.",
    "settingsCollapseBlankName": "Leerzeilen reduzieren",
    "settingsCollapseBlankDesc": "Begrenzt leere Abstände auf eine einzige Leerzeile.",
    "ribbonTooltip": "Bereinigten Text exportieren",

    "paletteAria": "Aktionen für bereinigten Textexport",
    "paletteSingleAria": "Aktuelle Notiz als bereinigten Text exportieren",
    "paletteBatchStartAria": "Markdown-Notizen im Datei-Explorer auswählen",
    "paletteBatchExportAria": "{count} ausgewählte Notiz(en) exportieren",
    "paletteCancelAria": "Aktuelle Stapelauswahl abbrechen und löschen",
    "batchModeEntered": "Auswahlmodus aktiv. Wähle Markdown-Notizen im Datei-Explorer aus.",
    "batchModeCanceled": "Stapelauswahl abgebrochen.",
    "batchSelectedCount": "{count} ausgewählt",
    "batchNoSelection": "Wähle mindestens eine Markdown-Notiz aus.",
    "batchSelectionInvalid": "Die Auswahl hat sich geändert: {count} nicht verfügbare Notiz(en) wurden entfernt. Prüfe die Auswahl und bestätige erneut.",
    "batchSourceChangedDuringExport": "Eine Quellnotiz wurde während des Exports geändert oder war nicht mehr verfügbar. Dieses Element wurde nicht exportiert.",
    "batchDestinationChangedDuringExport": "Das Exportziel hat sich während des Stapels geändert. Dieses Element wurde nicht exportiert, um ein anderes Ergebnis nicht zu überschreiben.",
    "commandExportCurrent": "Aktuelle Notiz als bereinigten Text exportieren (.txt)",
    "commandCopyCurrent": "Aktuelle Notiz als bereinigten Text kopieren",
    "commandOpenActions": "Optionen für bereinigten Export öffnen",
    "commandExportMultiple": "Notizen stapelweise als bereinigten Text exportieren…",
    "notMarkdownError": "Das ausgewählte Element ist keine Markdown-Notiz.",
    "currentNote": "aktuelle Notiz",
    "attachmentEmbed": "[Eingebetteter Anhang: {name}]",
    "missingNoteEmbed": "[Eingebettete Notiz nicht gefunden: {name}]",
    "circularEmbed": "[Zirkuläre Einbettung ignoriert: {name}]",
    "embedDepth": "[Einbettungslimit erreicht: {name}]",
    "missingBlock": "[Eingebetteter Block nicht gefunden: {name}]",
    "missingSection": "[Eingebetteter Abschnitt nicht gefunden: {name}]",
    "batchSuccess": "{count} Notiz(en) erfolgreich exportiert.",
    "batchPartial": "{exported} exportiert; {failed} fehlgeschlagen. Details in der Konsole.",
    "openMarkdownBeforeExport": "Öffnen Sie vor dem Export eine Markdown-Notiz.",
    "createFolderError": "Ordner konnte nicht erstellt werden: {path}",
    "folderCollision": "Es existiert bereits ein Ordner mit demselben Namen wie die exportierte Datei.",
    "writeNotConfirmed": "Obsidian hat die Dateierstellung nicht bestätigt.",
    "verifyMismatch": "Die Datei wurde erstellt, aber der gespeicherte Inhalt stimmt nicht mit dem exportierten Text überein.",
    "exportSuccess": "Bereinigter Text exportiert und überprüft: {path}",
    "exportFailure": "Export fehlgeschlagen: {message}",
    "copySuccess": "Bereinigter Text kopiert.",
    "copyAutoFail": "Automatisches Kopieren nicht möglich.",
    "copyFailure": "Kopieren fehlgeschlagen: {message}"
  },
  "ja": {
    "cleanExportTitle": "クリーンテキストを書き出す",
    "cleanExportDesc": "Markdown 書式と tiago7 のカラーコードを削除し、見出し、[ ] チェック欄、縦線 | は保持します。",
    "selectedNote": "選択中のノート",
    "selectedNoteAria": "選択中のノート: {name}",
    "singleExportName": "単一エクスポート",
    "singleExportDesc": "Vault 内にクリーンなコピーを作成または更新します。",
    "exportButton": "エクスポート",
    "exportButtonAria": "選択中のノートをクリーンな .txt ファイルとしてエクスポート",
    "copyTransferName": "クリップボードにコピー",
    "copyTransferDesc": "結果をコピーして、チャット、メール、その他のアプリに貼り付けられます。",
    "copyButton": "コピー",
    "copyButtonAria": "選択中のノートをクリーンテキストとしてコピー",
    "batchExportName": "一括エクスポート",
    "batchExportDesc": "Vault から複数のノートを選び、一度にエクスポートします。",
    "selectNotesButton": "ノートを選択",
    "selectNotesButtonAria": "一括エクスポート用のノート選択を開く",
    "multiTitle": "一括エクスポート",
    "multiDesc": "クリーンな .txt ファイルに変換する Markdown ノートを選択します。",
    "searchPlaceholder": "名前またはフォルダーで絞り込み…",
    "searchAria": "名前またはフォルダーでノートを絞り込む",
    "selectVisible": "表示中を選択",
    "selectVisibleAria": "絞り込み結果で現在表示中のノートをすべて選択",
    "noteFolder": "ノートのフォルダー",
    "noteFolderAria": "アクティブなノートと同じフォルダーのノートをすべて選択",
    "clearSelection": "選択を解除",
    "clearSelectionAria": "選択中のノートをすべて解除",
    "cancel": "キャンセル",
    "cancelAria": "一括エクスポートをキャンセル",
    "exportSelected": "選択項目を書き出す",
    "exportSelectedAria": "選択したノートをエクスポート",
    "noNotesFound": "ノートが見つかりません。",
    "fileCheckboxAria": "ノート {name} を選択",
    "countSummary": "{selected} 件選択 · {visible} 件表示 · Vault 内 {total} 件",
    "selectAtLeastOne": "少なくとも1つのノートを選択してください。",
    "exporting": "エクスポート中…",
    "openMarkdownForFolder": "フォルダーを選択するには Markdown ノートを開いてください。",
    "settingsExportFolderName": "エクスポート先フォルダー",
    "settingsExportFolderDesc": "Vault 内で .txt ファイルを作成するフォルダーです。",
    "settingsExportFolderAria": "エクスポート先フォルダーのパス",
    "settingsExportFolderPlaceholder": "テキスト書き出し",
    "settingsExpandEmbedsName": "エクスポート時に埋め込みノートを展開",
    "settingsExpandEmbedsDesc": "エクスポート時に ![[ノート]]、![[ノート#見出し]]、![[ノート#^ブロック]] を実際の内容に置き換えます。Vault のノート自体は変更しません。",
    "settingsMissingEmbedsName": "見つからない埋め込みを表示",
    "settingsMissingEmbedsDesc": "ノート、セクション、ブロックが存在しない場合、エクスポートテキストに案内を入れます。無効にすると、不正な埋め込みを静かに削除します。",
    "settingsPreserveFoldersName": "ノートのフォルダー構造を再現",
    "settingsPreserveFoldersDesc": "無効にすると、すべてのエクスポートファイルをエクスポート先フォルダー直下に保存します。",
    "settingsPreserveHeadingsName": "# 付き見出しを保持",
    "settingsPreserveHeadingsDesc": "#, ##, ### などの階層を保持して視覚的な構造を維持します。",
    "settingsPreserveListsName": "リスト記号を保持",
    "settingsPreserveListsDesc": "プレーンテキストでも読みやすいため、-, *, + と番号付きリストを保持します。",
    "settingsCollapseBlankName": "空行を減らす",
    "settingsCollapseBlankDesc": "空白区間を空行1行までに制限します。",
    "ribbonTooltip": "クリーンテキストを書き出す",

    "paletteAria": "クリーンテキスト書き出し操作",
    "paletteSingleAria": "現在のノートをクリーンテキストとして書き出す",
    "paletteBatchStartAria": "ファイルエクスプローラーで Markdown ノートの選択を開始",
    "paletteBatchExportAria": "選択した {count} 件のノートを書き出す",
    "paletteCancelAria": "現在の一括選択をキャンセルして解除",
    "batchModeEntered": "選択モードが有効です。ファイルエクスプローラーで Markdown ノートを選択してください。",
    "batchModeCanceled": "一括選択をキャンセルしました。",
    "batchSelectedCount": "{count} 件選択",
    "batchNoSelection": "少なくとも 1 件の Markdown ノートを選択してください。",
    "batchSelectionInvalid": "選択内容が変更されました。利用できないノート {count} 件を選択から外しました。確認してもう一度実行してください。",
    "batchSourceChangedDuringExport": "エクスポート中に元のノートが変更されたか利用できなくなりました。この項目はエクスポートされませんでした。",
    "batchDestinationChangedDuringExport": "一括エクスポート中に出力先が変わりました。別の結果を上書きしないよう、この項目はエクスポートされませんでした。",
    "commandExportCurrent": "現在のノートをクリーンテキストとして書き出す (.txt)",
    "commandCopyCurrent": "現在のノートをクリーンテキストとしてコピー",
    "commandOpenActions": "クリーンエクスポートのオプションを開く",
    "commandExportMultiple": "ノートをクリーンテキストとして一括エクスポート…",
    "notMarkdownError": "選択した項目は Markdown ノートではありません。",
    "currentNote": "現在のノート",
    "attachmentEmbed": "[埋め込み添付ファイル: {name}]",
    "missingNoteEmbed": "[埋め込みノートが見つかりません: {name}]",
    "circularEmbed": "[循環埋め込みを無視: {name}]",
    "embedDepth": "[埋め込み上限に到達: {name}]",
    "missingBlock": "[埋め込みブロックが見つかりません: {name}]",
    "missingSection": "[埋め込みセクションが見つかりません: {name}]",
    "batchSuccess": "{count} 件のノートを正常にエクスポートしました。",
    "batchPartial": "{exported} 件をエクスポート、{failed} 件が失敗しました。詳細はコンソールを確認してください。",
    "openMarkdownBeforeExport": "エクスポートする前に Markdown ノートを開いてください。",
    "createFolderError": "フォルダーを作成できませんでした: {path}",
    "folderCollision": "エクスポートファイルと同じ名前のフォルダーがすでに存在します。",
    "writeNotConfirmed": "Obsidian がファイル作成を確認できませんでした。",
    "verifyMismatch": "ファイルは作成されましたが、保存内容がエクスポートしたテキストと一致しません。",
    "exportSuccess": "クリーンテキストをエクスポートして確認しました: {path}",
    "exportFailure": "エクスポートに失敗しました: {message}",
    "copySuccess": "クリーンテキストをコピーしました。",
    "copyAutoFail": "自動コピーできませんでした。",
    "copyFailure": "コピーに失敗しました: {message}"
  },
  "ko": {
    "cleanExportTitle": "깔끔한 텍스트 내보내기",
    "cleanExportDesc": "Markdown 서식과 tiago7 색상 코드를 제거하고 제목, [ ] 상자, 세로 막대 | 는 유지합니다.",
    "selectedNote": "선택된 노트",
    "selectedNoteAria": "선택된 노트: {name}",
    "singleExportName": "단일 내보내기",
    "singleExportDesc": "Vault 안에 깔끔한 복사본을 만들거나 업데이트합니다.",
    "exportButton": "내보내기",
    "exportButtonAria": "선택된 노트를 깔끔한 .txt 파일로 내보내기",
    "copyTransferName": "클립보드에 복사",
    "copyTransferDesc": "결과를 복사하여 채팅, 이메일 또는 다른 앱에 붙여넣습니다.",
    "copyButton": "복사",
    "copyButtonAria": "선택된 노트를 깔끔한 텍스트로 복사",
    "batchExportName": "일괄 내보내기",
    "batchExportDesc": "Vault에서 여러 노트를 선택해 한 번에 내보냅니다.",
    "selectNotesButton": "노트 선택",
    "selectNotesButtonAria": "일괄 내보내기용 노트 선택 열기",
    "multiTitle": "일괄 내보내기",
    "multiDesc": "깔끔한 .txt 파일로 변환할 Markdown 노트를 선택하세요.",
    "searchPlaceholder": "이름 또는 폴더로 필터…",
    "searchAria": "이름 또는 폴더로 노트 필터",
    "selectVisible": "보이는 항목 선택",
    "selectVisibleAria": "필터된 목록에서 현재 보이는 노트 모두 선택",
    "noteFolder": "노트 폴더",
    "noteFolderAria": "활성 노트 폴더의 모든 노트 선택",
    "clearSelection": "선택 지우기",
    "clearSelectionAria": "선택된 모든 노트 해제",
    "cancel": "취소",
    "cancelAria": "일괄 내보내기 취소",
    "exportSelected": "선택 항목 내보내기",
    "exportSelectedAria": "선택한 노트 내보내기",
    "noNotesFound": "노트를 찾을 수 없습니다.",
    "fileCheckboxAria": "노트 {name} 선택",
    "countSummary": "{selected}개 선택 · {visible}개 표시 · Vault에 {total}개",
    "selectAtLeastOne": "노트를 하나 이상 선택하세요.",
    "exporting": "내보내는 중…",
    "openMarkdownForFolder": "폴더를 선택하려면 Markdown 노트를 여세요.",
    "settingsExportFolderName": "내보내기 폴더",
    "settingsExportFolderDesc": "Vault 안에서 .txt 파일을 만들 폴더입니다.",
    "settingsExportFolderAria": "내보내기 폴더 경로",
    "settingsExportFolderPlaceholder": "텍스트 내보내기",
    "settingsExpandEmbedsName": "내보낼 때 임베드 노트 펼치기",
    "settingsExpandEmbedsDesc": "내보낼 때 ![[노트]], ![[노트#제목]], ![[노트#^블록]]을 실제 내용으로 바꿉니다. Vault 노트는 수정하지 않습니다.",
    "settingsMissingEmbedsName": "찾을 수 없는 임베드 표시",
    "settingsMissingEmbedsDesc": "노트, 섹션 또는 블록이 없으면 내보낸 텍스트에 안내를 넣습니다. 끄면 잘못된 임베드를 조용히 제거합니다.",
    "settingsPreserveFoldersName": "노트 폴더 구조 반복",
    "settingsPreserveFoldersDesc": "끄면 모든 내보낸 파일을 내보내기 폴더 바로 아래에 저장합니다.",
    "settingsPreserveHeadingsName": "# 제목 유지",
    "settingsPreserveHeadingsDesc": "#, ##, ### 및 다른 수준을 유지해 시각적 계층을 보존합니다.",
    "settingsPreserveListsName": "목록 표시 유지",
    "settingsPreserveListsDesc": "일반 텍스트에서도 읽기 쉬우므로 -, *, + 및 번호 목록을 유지합니다.",
    "settingsCollapseBlankName": "빈 줄 줄이기",
    "settingsCollapseBlankDesc": "빈 구간을 빈 줄 한 줄로 제한합니다.",
    "ribbonTooltip": "깔끔한 텍스트 내보내기",

    "paletteAria": "깔끔한 텍스트 내보내기 작업",
    "paletteSingleAria": "현재 노트를 깔끔한 텍스트로 내보내기",
    "paletteBatchStartAria": "파일 탐색기에서 Markdown 노트 선택 시작",
    "paletteBatchExportAria": "선택한 노트 {count}개 내보내기",
    "paletteCancelAria": "현재 일괄 선택 취소 및 지우기",
    "batchModeEntered": "선택 모드가 활성화되었습니다. 파일 탐색기에서 Markdown 노트를 선택하세요.",
    "batchModeCanceled": "일괄 선택이 취소되었습니다.",
    "batchSelectedCount": "{count}개 선택됨",
    "batchNoSelection": "Markdown 노트를 하나 이상 선택하세요.",
    "batchSelectionInvalid": "선택 내용이 변경되었습니다. 사용할 수 없는 노트 {count}개를 선택에서 제거했습니다. 선택을 확인한 뒤 다시 실행하세요.",
    "batchSourceChangedDuringExport": "내보내는 동안 원본 노트가 변경되었거나 사용할 수 없게 되었습니다. 해당 항목은 내보내지 않았습니다.",
    "batchDestinationChangedDuringExport": "일괄 내보내기 중 대상 경로가 변경되었습니다. 다른 결과를 덮어쓰지 않도록 해당 항목은 내보내지 않았습니다.",
    "commandExportCurrent": "현재 노트를 깔끔한 텍스트로 내보내기 (.txt)",
    "commandCopyCurrent": "현재 노트를 깔끔한 텍스트로 복사",
    "commandOpenActions": "깔끔한 내보내기 옵션 열기",
    "commandExportMultiple": "노트를 깔끔한 텍스트로 일괄 내보내기…",
    "notMarkdownError": "선택한 항목은 Markdown 노트가 아닙니다.",
    "currentNote": "현재 노트",
    "attachmentEmbed": "[임베드 첨부 파일: {name}]",
    "missingNoteEmbed": "[임베드 노트를 찾을 수 없음: {name}]",
    "circularEmbed": "[순환 임베드 무시됨: {name}]",
    "embedDepth": "[임베드 제한 도달: {name}]",
    "missingBlock": "[임베드 블록을 찾을 수 없음: {name}]",
    "missingSection": "[임베드 섹션을 찾을 수 없음: {name}]",
    "batchSuccess": "노트 {count}개를 성공적으로 내보냈습니다.",
    "batchPartial": "{exported}개 내보냄; {failed}개 실패. 자세한 내용은 콘솔을 확인하세요.",
    "openMarkdownBeforeExport": "내보내기 전에 Markdown 노트를 여세요.",
    "createFolderError": "폴더를 만들 수 없습니다: {path}",
    "folderCollision": "내보낸 파일과 같은 이름의 폴더가 이미 있습니다.",
    "writeNotConfirmed": "Obsidian이 파일 생성을 확인하지 못했습니다.",
    "verifyMismatch": "파일은 만들어졌지만 저장된 내용이 내보낸 텍스트와 일치하지 않습니다.",
    "exportSuccess": "깔끔한 텍스트를 내보내고 확인했습니다: {path}",
    "exportFailure": "내보내기 실패: {message}",
    "copySuccess": "깔끔한 텍스트를 복사했습니다.",
    "copyAutoFail": "자동으로 복사할 수 없습니다.",
    "copyFailure": "복사 실패: {message}"
  },
  "zh-CN": {
    "cleanExportTitle": "导出纯文本",
    "cleanExportDesc": "移除 Markdown 格式和 tiago7 颜色代码，同时保留标题、[ ] 复选框和竖线 |。",
    "selectedNote": "已选笔记",
    "selectedNoteAria": "已选笔记：{name}",
    "singleExportName": "单个导出",
    "singleExportDesc": "在仓库中创建或更新一份纯文本副本。",
    "exportButton": "导出",
    "exportButtonAria": "将所选笔记导出为纯净的 .txt 文件",
    "copyTransferName": "复制到剪贴板",
    "copyTransferDesc": "复制结果，以便粘贴到聊天、邮件或其他应用中。",
    "copyButton": "复制",
    "copyButtonAria": "将所选笔记复制为纯文本",
    "batchExportName": "批量导出",
    "batchExportDesc": "从仓库中选择多个笔记并一次性全部导出。",
    "selectNotesButton": "选择笔记",
    "selectNotesButtonAria": "打开用于批量导出的笔记选择",
    "multiTitle": "批量导出",
    "multiDesc": "选择要转换为纯净 .txt 文件的 Markdown 笔记。",
    "searchPlaceholder": "按名称或文件夹筛选…",
    "searchAria": "按名称或文件夹筛选笔记",
    "selectVisible": "选择可见项",
    "selectVisibleAria": "选择筛选列表中当前可见的所有笔记",
    "noteFolder": "笔记文件夹",
    "noteFolderAria": "选择当前笔记所在文件夹中的所有笔记",
    "clearSelection": "清除选择",
    "clearSelectionAria": "清除所有已选笔记",
    "cancel": "取消",
    "cancelAria": "取消批量导出",
    "exportSelected": "导出所选项",
    "exportSelectedAria": "导出所选笔记",
    "noNotesFound": "未找到笔记。",
    "fileCheckboxAria": "选择笔记 {name}",
    "countSummary": "已选 {selected} · 可见 {visible} · 仓库共 {total}",
    "selectAtLeastOne": "请至少选择一个笔记。",
    "exporting": "正在导出…",
    "openMarkdownForFolder": "请打开一个 Markdown 笔记以选择其文件夹。",
    "settingsExportFolderName": "导出文件夹",
    "settingsExportFolderDesc": "在仓库中创建 .txt 文件的文件夹。",
    "settingsExportFolderAria": "导出文件夹路径",
    "settingsExportFolderPlaceholder": "文本导出",
    "settingsExpandEmbedsName": "导出时展开嵌入笔记",
    "settingsExpandEmbedsDesc": "导出时将 ![[笔记]]、![[笔记#标题]] 和 ![[笔记#^块]] 替换为实际内容。不会修改仓库中的笔记。",
    "settingsMissingEmbedsName": "标记未找到的嵌入",
    "settingsMissingEmbedsDesc": "当笔记、章节或块不存在时，在导出的文本中加入提示。关闭后会静默删除无效嵌入。",
    "settingsPreserveFoldersName": "保留笔记文件夹结构",
    "settingsPreserveFoldersDesc": "关闭后，所有导出文件都会直接放在导出文件夹中。",
    "settingsPreserveHeadingsName": "保留带 # 的标题",
    "settingsPreserveHeadingsDesc": "保留 #、##、### 等层级以维持视觉结构。",
    "settingsPreserveListsName": "保留列表标记",
    "settingsPreserveListsDesc": "保留 -、*、+ 和编号列表，因为它们在纯文本中仍易于阅读。",
    "settingsCollapseBlankName": "减少空行",
    "settingsCollapseBlankDesc": "将空白间隔限制为一行空行。",
    "ribbonTooltip": "导出纯文本",

    "paletteAria": "纯净文本导出操作",
    "paletteSingleAria": "将当前笔记导出为纯净文本",
    "paletteBatchStartAria": "开始在文件浏览器中选择 Markdown 笔记",
    "paletteBatchExportAria": "导出已选择的 {count} 个笔记",
    "paletteCancelAria": "取消并清除当前批量选择",
    "batchModeEntered": "选择模式已启用。请在文件浏览器中选择 Markdown 笔记。",
    "batchModeCanceled": "已取消批量选择。",
    "batchSelectedCount": "已选择 {count} 个",
    "batchNoSelection": "请至少选择一个 Markdown 笔记。",
    "batchSelectionInvalid": "选择已更改：已移除 {count} 个不可用的笔记。请检查选择后再次确认。",
    "batchSourceChangedDuringExport": "导出过程中源笔记发生变化或变得不可用。该项目未导出。",
    "batchDestinationChangedDuringExport": "批量导出过程中导出目标发生变化。为避免覆盖其他结果，该项目未导出。",
    "commandExportCurrent": "将当前笔记导出为纯文本 (.txt)",
    "commandCopyCurrent": "将当前笔记复制为纯文本",
    "commandOpenActions": "打开纯文本导出选项",
    "commandExportMultiple": "批量将笔记导出为纯文本…",
    "notMarkdownError": "所选项目不是 Markdown 笔记。",
    "currentNote": "当前笔记",
    "attachmentEmbed": "[嵌入附件：{name}]",
    "missingNoteEmbed": "[未找到嵌入笔记：{name}]",
    "circularEmbed": "[已忽略循环嵌入：{name}]",
    "embedDepth": "[已达到嵌入层级上限：{name}]",
    "missingBlock": "[未找到嵌入块：{name}]",
    "missingSection": "[未找到嵌入章节：{name}]",
    "batchSuccess": "已成功导出 {count} 个笔记。",
    "batchPartial": "已导出 {exported} 个；{failed} 个失败。详情请查看控制台。",
    "openMarkdownBeforeExport": "导出前请先打开一个 Markdown 笔记。",
    "createFolderError": "无法创建文件夹：{path}",
    "folderCollision": "已存在与导出文件同名的文件夹。",
    "writeNotConfirmed": "Obsidian 未确认文件已创建。",
    "verifyMismatch": "文件已创建，但保存的内容与导出的文本不一致。",
    "exportSuccess": "纯文本已导出并验证：{path}",
    "exportFailure": "导出失败：{message}",
    "copySuccess": "已复制纯文本。",
    "copyAutoFail": "无法自动复制。",
    "copyFailure": "复制失败：{message}"
  },
  "ru": {
    "cleanExportTitle": "Экспорт чистого текста",
    "cleanExportDesc": "Удаляет форматирование Markdown и цветовые коды tiago7, сохраняя заголовки, флажки [ ] и вертикальные черты |.",
    "selectedNote": "Выбранная заметка",
    "selectedNoteAria": "Выбранная заметка: {name}",
    "singleExportName": "Одиночный экспорт",
    "singleExportDesc": "Создаёт или обновляет чистую копию внутри хранилища.",
    "exportButton": "Экспорт",
    "exportButtonAria": "Экспортировать выбранную заметку как чистый файл .txt",
    "copyTransferName": "Копировать в буфер",
    "copyTransferDesc": "Копирует результат для вставки в чаты, письма или другие приложения.",
    "copyButton": "Копировать",
    "copyButtonAria": "Копировать выбранную заметку как чистый текст",
    "batchExportName": "Пакетный экспорт",
    "batchExportDesc": "Выберите несколько заметок в хранилище и экспортируйте их за один раз.",
    "selectNotesButton": "Выбрать заметки",
    "selectNotesButtonAria": "Открыть выбор заметок для пакетного экспорта",
    "multiTitle": "Пакетный экспорт",
    "multiDesc": "Выберите Markdown-заметки, которые будут преобразованы в чистые файлы .txt.",
    "searchPlaceholder": "Фильтр по имени или папке…",
    "searchAria": "Фильтровать заметки по имени или папке",
    "selectVisible": "Выбрать видимые",
    "selectVisibleAria": "Выбрать все заметки, видимые в отфильтрованном списке",
    "noteFolder": "Папка заметки",
    "noteFolderAria": "Выбрать все заметки в папке активной заметки",
    "clearSelection": "Очистить выбор",
    "clearSelectionAria": "Снять выбор со всех заметок",
    "cancel": "Отмена",
    "cancelAria": "Отменить пакетный экспорт",
    "exportSelected": "Экспортировать выбранные",
    "exportSelectedAria": "Экспортировать выбранные заметки",
    "noNotesFound": "Заметки не найдены.",
    "fileCheckboxAria": "Выбрать заметку {name}",
    "countSummary": "выбрано {selected} · видно {visible} · всего {total}",
    "selectAtLeastOne": "Выберите хотя бы одну заметку.",
    "exporting": "Экспорт…",
    "openMarkdownForFolder": "Откройте Markdown-заметку, чтобы выбрать её папку.",
    "settingsExportFolderName": "Папка экспорта",
    "settingsExportFolderDesc": "Папка внутри хранилища, где будут создаваться файлы .txt.",
    "settingsExportFolderAria": "Путь к папке экспорта",
    "settingsExportFolderPlaceholder": "Экспорт текста",
    "settingsExpandEmbedsName": "Разворачивать встроенные заметки при экспорте",
    "settingsExpandEmbedsDesc": "Заменяет ![[Заметка]], ![[Заметка#Заголовок]] и ![[Заметка#^блок]] реальным содержимым при экспорте. Заметки в хранилище не изменяются.",
    "settingsMissingEmbedsName": "Показывать отсутствующие встраивания",
    "settingsMissingEmbedsDesc": "Если заметка, раздел или блок не существует, добавляет указание в экспортированный текст. Если выключено, недействительное встраивание удаляется без сообщения.",
    "settingsPreserveFoldersName": "Повторять структуру папок заметки",
    "settingsPreserveFoldersDesc": "Если выключено, все экспортированные файлы помещаются непосредственно в папку экспорта.",
    "settingsPreserveHeadingsName": "Сохранять заголовки с #",
    "settingsPreserveHeadingsDesc": "Сохраняет #, ##, ### и другие уровни для поддержания визуальной иерархии.",
    "settingsPreserveListsName": "Сохранять маркеры списков",
    "settingsPreserveListsDesc": "Сохраняет -, *, + и нумерованные списки, поскольку они остаются читаемыми в простом тексте.",
    "settingsCollapseBlankName": "Уменьшать пустые строки",
    "settingsCollapseBlankDesc": "Ограничивает пустые интервалы одной пустой строкой.",
    "ribbonTooltip": "Экспорт чистого текста",

    "paletteAria": "Действия экспорта чистого текста",
    "paletteSingleAria": "Экспортировать текущую заметку как чистый текст",
    "paletteBatchStartAria": "Начать выбор Markdown-заметок в проводнике файлов",
    "paletteBatchExportAria": "Экспортировать выбранные заметки: {count}",
    "paletteCancelAria": "Отменить и очистить текущий пакетный выбор",
    "batchModeEntered": "Режим выбора активен. Выберите Markdown-заметки в проводнике файлов.",
    "batchModeCanceled": "Пакетный выбор отменён.",
    "batchSelectedCount": "Выбрано: {count}",
    "batchNoSelection": "Выберите хотя бы одну Markdown-заметку.",
    "batchSelectionInvalid": "Выбор изменился: недоступные заметки ({count}) удалены из выбора. Проверьте выбор и подтвердите снова.",
    "batchSourceChangedDuringExport": "Исходная заметка изменилась или стала недоступна во время экспорта. Этот элемент не был экспортирован.",
    "batchDestinationChangedDuringExport": "Путь экспорта изменился во время пакетной операции. Этот элемент не был экспортирован, чтобы не перезаписать другой результат.",
    "commandExportCurrent": "Экспортировать текущую заметку как чистый текст (.txt)",
    "commandCopyCurrent": "Копировать текущую заметку как чистый текст",
    "commandOpenActions": "Открыть параметры чистого экспорта",
    "commandExportMultiple": "Пакетно экспортировать заметки как чистый текст…",
    "notMarkdownError": "Выбранный элемент не является Markdown-заметкой.",
    "currentNote": "текущая заметка",
    "attachmentEmbed": "[Встроенное вложение: {name}]",
    "missingNoteEmbed": "[Встроенная заметка не найдена: {name}]",
    "circularEmbed": "[Циклическое встраивание пропущено: {name}]",
    "embedDepth": "[Достигнут предел встраиваний: {name}]",
    "missingBlock": "[Встроенный блок не найден: {name}]",
    "missingSection": "[Встроенный раздел не найден: {name}]",
    "batchSuccess": "Успешно экспортировано заметок: {count}.",
    "batchPartial": "Экспортировано: {exported}; ошибок: {failed}. Подробности в консоли.",
    "openMarkdownBeforeExport": "Перед экспортом откройте Markdown-заметку.",
    "createFolderError": "Не удалось создать папку: {path}",
    "folderCollision": "Папка с тем же именем, что и экспортируемый файл, уже существует.",
    "writeNotConfirmed": "Obsidian не подтвердил создание файла.",
    "verifyMismatch": "Файл создан, но сохранённое содержимое не совпадает с экспортированным текстом.",
    "exportSuccess": "Чистый текст экспортирован и проверен: {path}",
    "exportFailure": "Ошибка экспорта: {message}",
    "copySuccess": "Чистый текст скопирован.",
    "copyAutoFail": "Не удалось скопировать автоматически.",
    "copyFailure": "Ошибка копирования: {message}"
  }
};

function normalizeLocale(value) {
	const raw = String(value || "").trim().replace(/_/g, "-").toLowerCase();
	if (!raw) return "en";
	if (raw === "zh-cn" || raw.startsWith("zh-hans") || raw === "zh") return "zh-CN";
	if (raw.startsWith("pt")) return "pt-BR";
	if (raw.startsWith("ja")) return "ja";
	if (raw.startsWith("ko")) return "ko";
	if (raw.startsWith("de")) return "de";
	if (raw.startsWith("fr")) return "fr";
	if (raw.startsWith("es")) return "es";
	if (raw.startsWith("ru")) return "ru";
	if (raw.startsWith("en")) return "en";
	return "en";
}

function detectObsidianLocale() {
	const candidates = [];
	try {
		if (moment && typeof moment.locale === "function") candidates.push(moment.locale());
	} catch (_error) {}
	try {
		if (typeof document !== "undefined") candidates.push(document.documentElement?.getAttribute("lang"));
	} catch (_error) {}
	try {
		if (typeof localStorage !== "undefined") candidates.push(localStorage.getItem("language"));
	} catch (_error) {}

	for (const candidate of candidates) {
		if (candidate) return normalizeLocale(candidate);
	}
	return "en";
}

function translate(locale, key, vars = {}) {
	const table = I18N[locale] || I18N.en;
	let text = table[key] ?? I18N.en[key] ?? key;
	for (const [name, value] of Object.entries(vars || {})) {
		text = String(text).replaceAll(`{${name}}`, String(value));
	}
	return String(text);
}


function safeDecodeURIComponent(value) {
	try {
		return decodeURIComponent(value);
	} catch (_error) {
		return value;
	}
}

function splitWikilinkAlias(rawInner) {
	const text = String(rawInner || "");
	let escaped = false;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];

		if (char === "\\" && !escaped) {
			escaped = true;
			continue;
		}

		if (char === "|" && !escaped) {
			return text.slice(0, index).trim();
		}

		escaped = false;
	}

	return text.trim();
}

function stripEmbeddedFrontmatter(source) {
	return String(source || "")
		.replace(/^\uFEFF/, "")
		.replace(/^---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "");
}

function shiftEmbeddedHeadings(source) {
	const text = String(source || "").replace(/\r\n?/g, "\n");
	const lines = text.match(/[^\n]*(?:\n|$)/g) || [];
	let output = "";
	let inFence = false;
	let fenceCharacter = "";
	let fenceLength = 0;

	for (const line of lines) {
		if (!line) continue;

		const hasLineBreak = line.endsWith("\n");
		const lineWithoutBreak = hasLineBreak ? line.slice(0, -1) : line;
		const fence = lineWithoutBreak.match(/^\s*(`{3,}|~{3,})/);

		if (fence) {
			const marker = fence[1];
			if (!inFence) {
				inFence = true;
				fenceCharacter = marker[0];
				fenceLength = marker.length;
			} else if (marker[0] === fenceCharacter && marker.length >= fenceLength) {
				inFence = false;
				fenceCharacter = "";
				fenceLength = 0;
			}

			output += line;
			continue;
		}

		let shiftedLine = lineWithoutBreak;
		if (!inFence) {
			const heading = lineWithoutBreak.match(/^(\s{0,3}(?:(?:>\s*)+)?)(#{1,})(?=\s|$)(.*)$/);
			if (heading) {
				shiftedLine = `${heading[1]}#${heading[2]}${heading[3]}`;
			}
		}

		output += shiftedLine + (hasLineBreak ? "\n" : "");
	}

	return output;
}

function escapeRegExp(value) {
	return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeLeadingHeadingMarkup(source) {
	const text = String(source || "");
	const newlineIndex = text.indexOf("\n");
	const firstLine = newlineIndex === -1 ? text : text.slice(0, newlineIndex);

	if (/^\s{0,3}#{1,6}(?:\s+|$)/.test(firstLine)) {
		return newlineIndex === -1 ? "" : text.slice(newlineIndex + 1).replace(/^\n+/, "");
	}

	const lines = text.split("\n");
	if (lines.length >= 2 && /^\s*(?:=+|-+)\s*$/.test(lines[1])) {
		return lines.slice(2).join("\n").replace(/^\n+/, "");
	}

	return text;
}

function removeBlockIdentifier(source, blockId) {
	const escapedId = escapeRegExp(blockId);
	if (!escapedId) return String(source || "");

	return String(source || "")
		.replace(new RegExp(`(^|\\n)\\s*\\^${escapedId}\\s*(?=\\n|$)`, "g"), "$1")
		.replace(new RegExp(`\\s+\\^${escapedId}\\s*(?=\\n|$)`, "g"), "");
}

function getExplicitExtension(linkPath) {
	const normalized = String(linkPath || "").replace(/\\/g, "/");
	const name = normalized.split("/").pop() || "";
	const dotIndex = name.lastIndexOf(".");
	if (dotIndex <= 0 || dotIndex === name.length - 1) return "";
	return name.slice(dotIndex + 1).toLocaleLowerCase();
}

function getEmbedDisplayName(path, sourceFile, currentNoteLabel = "current note") {
	const normalized = String(path || "").replace(/\\/g, "/").trim();
	if (!normalized) return sourceFile ? sourceFile.basename : currentNoteLabel;
	const name = normalized.split("/").pop() || normalized;
	return name.replace(/\.md$/i, "");
}

function normalizeHeadingForMatch(value) {
	const decoded = safeDecodeURIComponent(String(value || ""));
	try {
		return stripHeading(decoded).toLocaleLowerCase();
	} catch (_error) {
		return decoded.trim().replace(/\s+/g, " ").toLocaleLowerCase();
	}
}

function getEmbedKey(file, subpath) {
	return `${file.path}::${safeDecodeURIComponent(String(subpath || "")).trim().toLocaleLowerCase()}`;
}

function isTiago7OpenTokenAt(text, index) {
	if (text[index] !== "{") return 0;

	if (
		text[index + 1] === "h" &&
		/[0-6]/.test(text[index + 2] || "") &&
		text[index + 3] === "{"
	) {
		return 4;
	}

	if (
		text[index + 1] === "f" &&
		/[0-9]/.test(text[index + 2] || "") &&
		text[index + 3] === "{"
	) {
		return 4;
	}

	if (text[index + 1] === "u" && text[index + 2] === "{") {
		return 3;
	}

	if (/[1-3]/.test(text[index + 1] || "") && text[index + 2] === "{") {
		return 3;
	}

	return 0;
}

function stripTiago7Syntax(text) {
	let output = "";
	let i = 0;
	let depth = 0;
	let justClosedTiago7 = false;

	while (i < text.length) {
		const openLength = isTiago7OpenTokenAt(text, i);

		if (openLength > 0) {
			depth += 1;
			i += openLength;
			justClosedTiago7 = false;
			continue;
		}

		if (text[i] === "}" && depth > 0) {
			depth -= 1;
			i += 1;
			justClosedTiago7 = true;
			continue;
		}

		// Older versions and manually nested formatting can leave one or more
		// extra closing braces immediately after a tiago7 token. They are code,
		// not visible prose, so discard that consecutive run as well.
		if (text[i] === "}" && justClosedTiago7) {
			i += 1;
			continue;
		}

		output += text[i];
		justClosedTiago7 = false;
		i += 1;
	}

	return output
		.replace(/\{h[0-6]\{/g, "")
		.replace(/\{f[0-9]\{/g, "")
		.replace(/\{u\{/g, "")
		.replace(/\{[1-3]\{/g, "");
}

function friendlyWikiTarget(rawTarget) {
	let target = String(rawTarget || "").trim();
	if (!target) return "";

	const blockIndex = target.indexOf("#^");
	const headingIndex = target.indexOf("#");

	if (blockIndex !== -1) {
		target = target.slice(0, blockIndex);
	} else if (headingIndex !== -1) {
		const filePart = target.slice(0, headingIndex);
		const headingPart = target.slice(headingIndex + 1);
		target = headingPart || filePart;
	}

	target = target.replace(/\\/g, "/");
	const parts = target.split("/");
	target = parts[parts.length - 1] || target;
	target = target.replace(/\.md$/i, "");

	return target;
}

function replaceWikiLinks(text) {
	return text.replace(/(!)?\[\[([^\]]+)\]\]/g, (_match, _embed, inner) => {
		const pipeIndex = inner.lastIndexOf("|");

		if (pipeIndex !== -1) {
			return inner.slice(pipeIndex + 1).trim();
		}

		return friendlyWikiTarget(inner);
	});
}

function replaceMarkdownLinks(text) {
	let output = text;

	// Images first, so they are not consumed by the regular-link expression.
	output = output.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_match, alt) => alt.trim());
	output = output.replace(/\[([^\]]+)\]\([^)]*\)/g, (_match, label) => label);
	output = output.replace(/<((?:https?:\/\/|mailto:)[^>]+)>/gi, "$1");

	return output;
}

function splitTableRow(line) {
	let working = line.trim();
	if (working.startsWith("|")) working = working.slice(1);
	if (working.endsWith("|")) working = working.slice(0, -1);

	const cells = [];
	let current = "";
	let escaped = false;

	for (const ch of working) {
		if (escaped) {
			current += ch;
			escaped = false;
			continue;
		}

		if (ch === "\\") {
			escaped = true;
			continue;
		}

		if (ch === "|") {
			cells.push(current.trim());
			current = "";
			continue;
		}

		current += ch;
	}

	cells.push(current.trim());
	return cells;
}

function isTableSeparator(line) {
	const trimmed = line.trim();
	if (!trimmed.includes("|")) return false;

	const cells = splitTableRow(trimmed);
	if (cells.length < 2) return false;

	return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
}

function cleanInlineMarkdown(text) {
	let output = text;

	output = replaceWikiLinks(output);
	output = replaceMarkdownLinks(output);

	// Inline code and math delimiters: keep the visible content.
	output = output.replace(/`([^`]+)`/g, "$1");
	output = output.replace(/\$([^$\n]+)\$/g, "$1");

	// Native Obsidian formatting and common Markdown emphasis.
	for (let pass = 0; pass < 4; pass += 1) {
		output = output
			.replace(/\*\*([^*]+)\*\*/g, "$1")
			.replace(/__([^_]+)__/g, "$1")
			.replace(/~~([^~]+)~~/g, "$1")
			.replace(/==([^=]+)==/g, "$1")
			.replace(/\*([^*\n]+)\*/g, "$1")
			.replace(/_([^_\n]+)_/g, "$1");
	}

	// Footnote references and block IDs.
	output = output.replace(/\[\^[^\]]+\]/g, "");
	output = output.replace(/\s+\^[A-Za-z0-9_-]+\s*$/g, "");

	// HTML tags. Convert line breaks before removing the remaining tags.
	output = output.replace(/<br\s*\/?>/gi, "\n");
	output = output.replace(/<[^>]+>/g, "");

	// Markdown escapes.
	output = output.replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, "$1");

	return output;
}

function cleanMarkdown(source, settings) {
	let text = String(source || "")
		.replace(/^\uFEFF/, "")
		.replace(/\r\n?/g, "\n");

	// YAML frontmatter only when it is at the very beginning of the note.
	text = text.replace(/^---\n[\s\S]*?\n---\s*\n?/, "");

	// Obsidian comments and HTML comments.
	text = text.replace(/%%[\s\S]*?%%/g, "");
	text = text.replace(/<!--[\s\S]*?-->/g, "");

	// Custom tiago7 Color Tools syntax.
	text = stripTiago7Syntax(text);

	const lines = text.split("\n");
	const outputLines = [];
	let inFence = false;
	let fenceMarker = "";

	for (let rawLine of lines) {
		let line = rawLine;
		const trimmed = line.trim();

		const fenceMatch = trimmed.match(/^(```+|~~~+)/);
		if (fenceMatch) {
			const marker = fenceMatch[1][0];

			if (!inFence) {
				inFence = true;
				fenceMarker = marker;
			} else if (marker === fenceMarker) {
				inFence = false;
				fenceMarker = "";
			}

			continue;
		}

		if (inFence) {
			outputLines.push(line);
			continue;
		}

		// Remove horizontal rules.
		if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
			continue;
		}

		// Remove standalone display-math delimiters, retaining formula lines.
		if (/^\s*\$\$\s*$/.test(line)) {
			continue;
		}

		// Callouts and blockquotes.
		line = line.replace(/^\s*>\s*\[![^\]]+\][+-]?\s*/i, "");
		line = line.replace(/^\s*>\s?/, "");

		// Preserve headings as requested, while normalizing spacing.
		const headingMatch = line.match(/^\s*(#{1,})(?:\s+|$)(.*)$/);
		if (headingMatch) {
			const headingText = cleanInlineMarkdown(headingMatch[2]).trim();
			line = settings.preserveHeadings
				? `${headingMatch[1]} ${headingText}`.trimEnd()
				: headingText;
			outputLines.push(line);
			continue;
		}

		// Footnote definitions: keep the visible explanation, remove the id.
		line = line.replace(/^\s*\[\^[^\]]+\]:\s*/, "");

		if (!settings.preserveLists) {
			line = line
				.replace(/^\s*[-*+]\s+/, "")
				.replace(/^\s*\d+[.)]\s+/, "");
		}

		line = cleanInlineMarkdown(line);
		line = line.replace(/[ \t]+$/g, "");
		outputLines.push(line);
	}

	let output = outputLines.join("\n");

	if (settings.collapseBlankLines) {
		output = output.replace(/\n{3,}/g, "\n\n");
	}

	return output.trim() + "\n";
}

async function copyToClipboard(text) {
	if (navigator.clipboard && navigator.clipboard.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (_error) {}
	}

	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.opacity = "0";
	document.body.appendChild(textarea);
	textarea.select();
	textarea.setSelectionRange(0, textarea.value.length);

	let success = false;
	try {
		success = document.execCommand("copy");
	} catch (_error) {
		success = false;
	}

	textarea.remove();
	return success;
}

class ExportActionsModal extends Modal {
	constructor(app, plugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		const t = (key, vars) => this.plugin.t(key, vars);
		contentEl.empty();
		contentEl.addClass("vpte-modal", "vpte-actions-modal");

		const titleId = `vpte-actions-title-${Date.now()}`;
		const descId = `vpte-actions-desc-${Date.now()}`;
		contentEl.createEl("h2", { text: t("cleanExportTitle"), attr: { id: titleId } });
		contentEl.createEl("p", {
			cls: "vpte-modal-intro",
			text: t("cleanExportDesc"),
			attr: { id: descId }
		});
		modalEl.setAttr("aria-labelledby", titleId);
		modalEl.setAttr("aria-describedby", descId);

		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile instanceof TFile && activeFile.extension === "md") {
			const selectedNote = contentEl.createDiv({
				cls: "vpte-selected-note",
				attr: { "aria-label": t("selectedNoteAria", { name: activeFile.basename }) }
			});
			selectedNote.createSpan({ cls: "vpte-selected-note-mark", text: "◆", attr: { "aria-hidden": "true" } });
			selectedNote.createSpan({ text: activeFile.basename });
		}

		const singleSetting = new Setting(contentEl)
			.setName(t("singleExportName"))
			.setDesc(t("singleExportDesc"))
			.addButton((button) => {
				button.setButtonText(t("exportButton")).setCta().onClick(async () => {
					await this.plugin.exportCurrentNote();
					this.close();
				});
				button.buttonEl.setAttr("aria-label", t("exportButtonAria"));
				button.buttonEl.setAttr("title", t("exportButtonAria"));
			});
		singleSetting.settingEl.addClass("vpte-action-setting");

		const copySetting = new Setting(contentEl)
			.setName(t("copyTransferName"))
			.setDesc(t("copyTransferDesc"))
			.addButton((button) => {
				button.setButtonText(t("copyButton")).onClick(async () => {
					await this.plugin.copyCurrentNote();
					this.close();
				});
				button.buttonEl.setAttr("aria-label", t("copyButtonAria"));
				button.buttonEl.setAttr("title", t("copyButtonAria"));
			});
		copySetting.settingEl.addClass("vpte-action-setting");

		const batchSetting = new Setting(contentEl)
			.setName(t("batchExportName"))
			.setDesc(t("batchExportDesc"))
			.addButton((button) => {
				button.setButtonText(t("selectNotesButton")).onClick(() => {
					this.close();
					new MultiExportModal(this.app, this.plugin).open();
				});
				button.buttonEl.setAttr("aria-label", t("selectNotesButtonAria"));
				button.buttonEl.setAttr("title", t("selectNotesButtonAria"));
			});
		batchSetting.settingEl.addClass("vpte-action-setting");
	}
}

class MultiExportModal extends Modal {
	constructor(app, plugin) {
		super(app);
		this.plugin = plugin;
		this.files = [];
		this.selectedPaths = new Set();
		this.query = "";
		this.listEl = null;
		this.countEl = null;
		this.exportButton = null;
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		const t = (key, vars) => this.plugin.t(key, vars);
		contentEl.empty();
		modalEl.addClass("vpte-multi-shell");
		contentEl.addClass("vpte-modal", "vpte-multi-modal");
		const titleId = `vpte-multi-title-${Date.now()}`;
		const descId = `vpte-multi-desc-${Date.now()}`;
		contentEl.createEl("h2", { text: t("multiTitle"), attr: { id: titleId } });
		contentEl.createEl("p", { cls: "vpte-modal-intro", text: t("multiDesc"), attr: { id: descId } });
		modalEl.setAttr("aria-labelledby", titleId);
		modalEl.setAttr("aria-describedby", descId);

		this.files = this.app.vault
			.getMarkdownFiles()
			.slice()
			.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));

		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile instanceof TFile && activeFile.extension === "md") {
			this.selectedPaths.add(activeFile.path);
		}

		const search = contentEl.createEl("input", { cls: "vpte-search" });
		search.type = "search";
		search.placeholder = t("searchPlaceholder");
		search.setAttr("aria-label", t("searchAria"));
		search.addEventListener("input", () => {
			this.query = search.value.trim().toLocaleLowerCase();
			this.renderList();
		});

		const toolbar = contentEl.createDiv({ cls: "vpte-selection-toolbar", attr: { role: "toolbar", "aria-label": t("multiTitle") } });

		const selectVisibleButton = toolbar.createEl("button", { text: t("selectVisible"), attr: { type: "button", "aria-label": t("selectVisibleAria"), title: t("selectVisibleAria") } });
		selectVisibleButton.addEventListener("click", () => {
			for (const file of this.getVisibleFiles()) this.selectedPaths.add(file.path);
			this.renderList();
		});

		const folderButton = toolbar.createEl("button", { text: t("noteFolder"), attr: { type: "button", "aria-label": t("noteFolderAria"), title: t("noteFolderAria") } });
		folderButton.addEventListener("click", () => {
			const current = this.app.workspace.getActiveFile();
			if (!(current instanceof TFile) || current.extension !== "md") {
				new Notice(t("openMarkdownForFolder"));
				return;
			}

			const folderPath = current.parent ? current.parent.path : "/";
			for (const file of this.files) {
				const fileFolder = file.parent ? file.parent.path : "/";
				if (fileFolder === folderPath) this.selectedPaths.add(file.path);
			}
			this.renderList();
		});

		const clearButton = toolbar.createEl("button", { text: t("clearSelection"), attr: { type: "button", "aria-label": t("clearSelectionAria"), title: t("clearSelectionAria") } });
		clearButton.addEventListener("click", () => {
			this.selectedPaths.clear();
			this.renderList();
		});

		this.countEl = contentEl.createDiv({ cls: "vpte-selection-count" });
		this.listEl = contentEl.createDiv({ cls: "vpte-file-list", attr: { role: "group", "aria-label": t("multiDesc") } });

		const footer = contentEl.createDiv({ cls: "vpte-multi-footer" });
		const cancelButton = footer.createEl("button", { text: t("cancel"), attr: { type: "button", "aria-label": t("cancelAria"), title: t("cancelAria") } });
		cancelButton.addEventListener("click", () => this.close());

		this.exportButton = footer.createEl("button", {
			text: t("exportSelected"), cls: "mod-cta",
			attr: { type: "button", "aria-label": t("exportSelectedAria"), title: t("exportSelectedAria") }
		});
		this.exportButton.addEventListener("click", async () => { await this.exportSelected(); });

		this.renderList();
		setTimeout(() => search.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
		this.modalEl.removeClass("vpte-multi-shell");
	}

	getVisibleFiles() {
		if (!this.query) return this.files;
		return this.files.filter((file) => file.path.toLocaleLowerCase().includes(this.query));
	}

	renderList() {
		if (!this.listEl) return;
		const t = (key, vars) => this.plugin.t(key, vars);
		this.listEl.empty();

		const visibleFiles = this.getVisibleFiles();
		if (visibleFiles.length === 0) this.listEl.createDiv({ cls: "vpte-empty", text: t("noNotesFound") });

		for (const file of visibleFiles) {
			const row = this.listEl.createEl("label", { cls: "vpte-file-row" });
			const checkbox = row.createEl("input");
			checkbox.type = "checkbox";
			checkbox.checked = this.selectedPaths.has(file.path);
			checkbox.setAttr("aria-label", t("fileCheckboxAria", { name: file.basename }));
			checkbox.addEventListener("change", () => {
				if (checkbox.checked) this.selectedPaths.add(file.path);
				else this.selectedPaths.delete(file.path);
				this.updateCount();
			});

			const textWrap = row.createDiv({ cls: "vpte-file-text" });
			textWrap.createDiv({ cls: "vpte-file-name", text: file.basename });
			textWrap.createDiv({ cls: "vpte-file-path", text: file.path });
		}
		this.updateCount();
	}

	updateCount() {
		const selectedCount = this.selectedPaths.size;
		const visibleCount = this.getVisibleFiles().length;
		if (this.countEl) this.countEl.setText(this.plugin.t("countSummary", { selected: selectedCount, visible: visibleCount, total: this.files.length }));
		if (this.exportButton) this.exportButton.disabled = selectedCount === 0;
	}

	async exportSelected() {
		const selectedFiles = this.files.filter((file) => this.selectedPaths.has(file.path));
		if (selectedFiles.length === 0) {
			new Notice(this.plugin.t("selectAtLeastOne"));
			return;
		}

		this.exportButton.disabled = true;
		this.exportButton.setText(this.plugin.t("exporting"));
		this.exportButton.setAttribute("aria-busy", "true");
		try {
			const result = await this.plugin.exportFiles(selectedFiles);
			if (result.failed === 0) this.close();
		} finally {
			if (this.exportButton) {
				this.exportButton.setText(this.plugin.t("exportSelected"));
				this.exportButton.removeAttribute("aria-busy");
				this.exportButton.disabled = this.selectedPaths.size === 0;
			}
		}
	}
}

class Tiago7PlainTextSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		const t = (key, vars) => this.plugin.t(key, vars);
		containerEl.empty();
		containerEl.createEl("h2", { text: "tiago7 Plain Text Export Plugin Obsidian" });

		const exportFolder = new Setting(containerEl)
			.setName(t("settingsExportFolderName"))
			.setDesc(t("settingsExportFolderDesc"))
			.addText((text) => {
				text.setPlaceholder(t("settingsExportFolderPlaceholder"))
					.setValue(this.plugin.settings.exportFolder)
					.onChange(async (value) => {
						this.plugin.settings.exportFolder = value.trim() || DEFAULT_SETTINGS.exportFolder;
						await this.plugin.saveSettings();
					});
				text.inputEl.setAttr("aria-label", t("settingsExportFolderAria"));
			});
		exportFolder.settingEl.addClass("vpte-accessible-setting");

		this.addToggleSetting(containerEl, "settingsExpandEmbedsName", "settingsExpandEmbedsDesc", "expandEmbeddedNotes");
		this.addToggleSetting(containerEl, "settingsMissingEmbedsName", "settingsMissingEmbedsDesc", "indicateMissingEmbeds");
		this.addToggleSetting(containerEl, "settingsPreserveFoldersName", "settingsPreserveFoldersDesc", "preserveSourceFolders");
		this.addToggleSetting(containerEl, "settingsPreserveHeadingsName", "settingsPreserveHeadingsDesc", "preserveHeadings");
		this.addToggleSetting(containerEl, "settingsPreserveListsName", "settingsPreserveListsDesc", "preserveLists");
		this.addToggleSetting(containerEl, "settingsCollapseBlankName", "settingsCollapseBlankDesc", "collapseBlankLines");
	}

	addToggleSetting(containerEl, nameKey, descKey, settingKey) {
		const setting = new Setting(containerEl)
			.setName(this.plugin.t(nameKey))
			.setDesc(this.plugin.t(descKey))
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings[settingKey]).onChange(async (value) => {
					this.plugin.settings[settingKey] = value;
					await this.plugin.saveSettings();
				});
				toggle.toggleEl.setAttr("aria-label", this.plugin.t(nameKey));
			});
		setting.settingEl.addClass("vpte-accessible-setting");
	}
}

module.exports = class Tiago7PlainTextExport extends Plugin {
	async onload() {
		this.locale = detectObsidianLocale();
		this.paletteEl = null;
		this.paletteSingleButton = null;
		this.paletteBatchButton = null;
		this.paletteBatchIconEl = null;
		this.paletteCancelButton = null;
		this.paletteBatchBadge = null;
		this.ribbonIconEl = null;
		this.batchSelectionMode = false;
		this.batchSelectedFiles = new Set();
		this.batchObserver = null;
		this.batchRenderRaf = 0;
		// Incremented only when a vault mutation can change the deterministic
		// source-note -> export-path mapping. Exported .txt writes and ordinary
		// content edits deliberately do not invalidate the map.
		this.exportPathMapGeneration = 0;

		registerExportPaletteIcons();
		this.createLiveRegion();
		await this.loadSettings();

		// Faz arquivos .txt aparecerem no explorador do Obsidian e permite abri-los.
		// O conteúdo continua sendo texto puro no disco.
		this.registerExtensions(["txt"], "markdown");

		const ribbonIcon = this.addRibbonIcon("file-output", this.t("ribbonTooltip"), () => {
			this.toggleExportPalette();
		});
		this.ribbonIconEl = ribbonIcon || null;
		ribbonIcon?.setAttr?.("aria-label", this.t("ribbonTooltip"));
		ribbonIcon?.setAttr?.("title", this.t("ribbonTooltip"));

		this.registerDomEvent(document, "click", (event) => this.handleDocumentClick(event), true);
		this.registerDomEvent(document, "keydown", (event) => this.handleDocumentKeydown(event), true);
		this.registerDomEvent(window, "resize", () => this.positionExportPalette());
		this.registerEvent(this.app.vault.on("create", (file) => this.handleExportPathVaultCreate(file)));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.handleBatchVaultRename(file, oldPath)));
		this.registerEvent(this.app.vault.on("delete", (file) => this.handleBatchVaultDelete(file)));

		this.addCommand({
			id: "export-current-note-clean-text",
			name: this.t("commandExportCurrent"),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!(file instanceof TFile) || file.extension !== "md") return false;
				if (!checking) void this.exportCurrentNote();
				return true;
			}
		});

		this.addCommand({
			id: "copy-current-note-clean-text",
			name: this.t("commandCopyCurrent"),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!(file instanceof TFile) || file.extension !== "md") return false;
				if (!checking) void this.copyCurrentNote();
				return true;
			}
		});

		this.addCommand({
			id: "open-clean-export-actions",
			name: this.t("commandOpenActions"),
			callback: () => this.toggleExportPalette()
		});

		this.addCommand({
			id: "export-multiple-notes-clean-text",
			name: this.t("commandExportMultiple"),
			callback: () => new MultiExportModal(this.app, this).open()
		});

		this.addSettingTab(new Tiago7PlainTextSettingTab(this.app, this));
	}

	onunload() {
		this.exitBatchSelection({ clear: true, announce: false });
		this.removeExportPalette();
		if (this.liveRegionEl) {
			this.liveRegionEl.remove();
			this.liveRegionEl = null;
		}
	}

	t(key, vars = {}) {
		return translate(this.locale || "en", key, vars);
	}

	createLiveRegion() {
		if (typeof document === "undefined" || this.liveRegionEl) return;
		const live = document.createElement("div");
		live.className = "vpte-sr-live";
		live.setAttribute("role", "status");
		live.setAttribute("aria-live", "polite");
		live.setAttribute("aria-atomic", "true");
		document.body.appendChild(live);
		this.liveRegionEl = live;
	}

	announce(message) {
		if (!this.liveRegionEl || !message) return;
		this.liveRegionEl.textContent = "";
		window.setTimeout(() => {
			if (this.liveRegionEl) this.liveRegionEl.textContent = String(message);
		}, 20);
	}


	ensureExportPalette() {
		if (this.paletteEl || typeof document === "undefined") return;

		const palette = document.createElement("div");
		palette.className = "vpte-export-palette";
		palette.setAttribute("role", "toolbar");
		palette.setAttribute("aria-label", this.t("paletteAria"));
		palette.hidden = true;

		const singleButton = document.createElement("button");
		singleButton.type = "button";
		singleButton.className = "vpte-export-palette-button vpte-export-palette-single";
		setIcon(singleButton, "tiago7-pte-single-page");
		singleButton.setAttribute("aria-label", this.t("paletteSingleAria"));
		singleButton.setAttribute("title", this.t("paletteSingleAria"));
		singleButton.addEventListener("click", async (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (this.batchSelectionMode) this.exitBatchSelection({ clear: true, announce: false });
			this.closeExportPalette();
			await this.exportCurrentNote();
		});

		const batchButton = document.createElement("button");
		batchButton.type = "button";
		batchButton.className = "vpte-export-palette-button vpte-export-palette-batch";
		const batchIcon = document.createElement("span");
		batchIcon.className = "vpte-export-palette-icon";
		batchIcon.setAttribute("aria-hidden", "true");
		setIcon(batchIcon, "tiago7-pte-multi-page");
		batchButton.appendChild(batchIcon);
		batchButton.setAttribute("aria-pressed", "false");
		batchButton.addEventListener("click", async (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (!this.batchSelectionMode) {
				this.enterBatchSelection();
				return;
			}

			if (this.batchSelectedFiles.size === 0) {
				new Notice(this.t("batchNoSelection"));
				return;
			}

			const selectedFiles = Array.from(this.batchSelectedFiles);
			const files = selectedFiles.filter((file) => this.isCurrentSelectedMarkdownFile(file));
			const invalidCount = selectedFiles.length - files.length;

			if (invalidCount > 0) {
				for (const file of selectedFiles) {
					if (!this.isCurrentSelectedMarkdownFile(file)) this.batchSelectedFiles.delete(file);
				}
				this.renderExplorerSelection();
				this.updateBatchPaletteState();
				const message = this.t("batchSelectionInvalid", { count: invalidCount });
				new Notice(message);
				this.announce(message);
				return;
			}

			this.exitBatchSelection({ clear: true, announce: false });
			this.closeExportPalette();
			await this.exportFiles(files);
		});

		const badge = document.createElement("span");
		badge.className = "vpte-export-palette-badge";
		badge.setAttribute("aria-hidden", "true");
		badge.hidden = true;
		batchButton.appendChild(badge);

		const cancelButton = document.createElement("button");
		cancelButton.type = "button";
		cancelButton.className = "vpte-export-palette-button vpte-export-palette-cancel";
		setIcon(cancelButton, "tiago7-pte-cancel-page");
		cancelButton.setAttribute("aria-label", this.t("paletteCancelAria"));
		cancelButton.setAttribute("title", this.t("paletteCancelAria"));
		cancelButton.disabled = true;
		cancelButton.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.exitBatchSelection({ clear: true, announce: true });
		});

		palette.append(singleButton, batchButton, cancelButton);
		document.body.appendChild(palette);

		this.paletteEl = palette;
		this.paletteSingleButton = singleButton;
		this.paletteBatchButton = batchButton;
		this.paletteBatchIconEl = batchIcon;
		this.paletteCancelButton = cancelButton;
		this.paletteBatchBadge = badge;
		this.updateBatchPaletteState();
	}

	toggleExportPalette() {
		this.ensureExportPalette();
		if (!this.paletteEl) return;
		if (!this.paletteEl.hidden) {
			if (this.batchSelectionMode) this.exitBatchSelection({ clear: true, announce: true });
			this.closeExportPalette();
			return;
		}
		this.openExportPalette();
	}

	openExportPalette() {
		this.ensureExportPalette();
		if (!this.paletteEl) return;
		this.paletteEl.hidden = false;
		this.paletteEl.classList.add("is-open");
		this.updateBatchPaletteState();
		window.requestAnimationFrame(() => {
			this.positionExportPalette();
			this.paletteSingleButton?.focus?.({ preventScroll: true });
		});
	}

	closeExportPalette() {
		if (!this.paletteEl) return;
		this.paletteEl.classList.remove("is-open");
		this.paletteEl.hidden = true;
	}

	removeExportPalette() {
		if (this.paletteEl) this.paletteEl.remove();
		this.paletteEl = null;
		this.paletteSingleButton = null;
		this.paletteBatchButton = null;
		this.paletteCancelButton = null;
		this.paletteBatchBadge = null;
	}

	positionExportPalette() {
		if (!this.paletteEl || this.paletteEl.hidden) return;
		const anchor = this.ribbonIconEl;
		if (!anchor || typeof anchor.getBoundingClientRect !== "function") {
			this.paletteEl.style.left = "56px";
			this.paletteEl.style.top = "72px";
			return;
		}

		const anchorRect = anchor.getBoundingClientRect();
		const paletteRect = this.paletteEl.getBoundingClientRect();
		const margin = 8;
		let left = anchorRect.right + margin;
		let top = anchorRect.top + (anchorRect.height - paletteRect.height) / 2;

		if (left + paletteRect.width > window.innerWidth - margin) {
			left = Math.max(margin, anchorRect.left - paletteRect.width - margin);
		}
		top = Math.min(
			Math.max(margin, top),
			Math.max(margin, window.innerHeight - paletteRect.height - margin)
		);

		this.paletteEl.style.left = `${Math.round(left)}px`;
		this.paletteEl.style.top = `${Math.round(top)}px`;
	}

	handleDocumentClick(event) {
		const target = event.target instanceof Element ? event.target : null;
		if (!target) return;

		if (this.batchSelectionMode) {
			const fileEl = target.closest(".nav-file-title[data-path]");
			if (fileEl && !fileEl.closest(".vpte-export-palette")) {
				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation?.();
				const path = fileEl.getAttribute("data-path") || "";
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile && file.extension.toLocaleLowerCase() === "md") {
					this.toggleBatchFile(file);
				} else {
					new Notice(this.t("notMarkdownError"));
				}
				return;
			}
		}

		if (!this.paletteEl || this.paletteEl.hidden || this.batchSelectionMode) return;
		if (target.closest(".vpte-export-palette")) return;
		if (this.ribbonIconEl && (target === this.ribbonIconEl || this.ribbonIconEl.contains(target))) return;
		this.closeExportPalette();
	}

	handleDocumentKeydown(event) {
		if (event.key === "Escape") {
			if (this.batchSelectionMode) this.exitBatchSelection({ clear: true, announce: true });
			if (this.paletteEl && !this.paletteEl.hidden) this.closeExportPalette();
			return;
		}

		if (!this.batchSelectionMode || (event.key !== "Enter" && event.key !== " ")) return;
		const target = event.target instanceof Element ? event.target : null;
		const fileEl = target?.closest?.(".nav-file-title[data-path]");
		if (!fileEl) return;
		const path = fileEl.getAttribute("data-path") || "";
		const file = this.app.vault.getAbstractFileByPath(path);
		event.preventDefault();
		event.stopPropagation();
		if (!(file instanceof TFile) || file.extension.toLocaleLowerCase() !== "md") {
			new Notice(this.t("notMarkdownError"));
			return;
		}
		this.toggleBatchFile(file);
	}

	enterBatchSelection() {
		if (this.batchSelectionMode) return;
		this.batchSelectionMode = true;
		this.batchSelectedFiles.clear();
		document.body?.classList?.add("vpte-batch-select-mode");
		this.startBatchObserver();
		this.renderExplorerSelection();
		this.updateBatchPaletteState();
		this.announce(this.t("batchModeEntered"));
	}

	exitBatchSelection({ clear = true, announce = false } = {}) {
		const wasActive = this.batchSelectionMode;
		this.batchSelectionMode = false;
		if (clear) this.batchSelectedFiles.clear();
		document.body?.classList?.remove("vpte-batch-select-mode");
		this.stopBatchObserver();
		this.clearExplorerSelectionVisuals();
		this.updateBatchPaletteState();
		if (announce && wasActive) this.announce(this.t("batchModeCanceled"));
	}

	isCurrentSelectedMarkdownFile(file) {
		if (!(file instanceof TFile) || file.extension.toLocaleLowerCase() !== "md") return false;
		return this.app.vault.getAbstractFileByPath(file.path) === file;
	}

	toggleBatchFile(file) {
		if (!this.batchSelectionMode || !(file instanceof TFile) || file.extension.toLocaleLowerCase() !== "md") return;
		if (this.batchSelectedFiles.has(file)) this.batchSelectedFiles.delete(file);
		else this.batchSelectedFiles.add(file);
		this.renderExplorerSelection();
		this.updateBatchPaletteState();
		this.announce(this.t("batchSelectedCount", { count: this.batchSelectedFiles.size }));
	}

	isMarkdownSourcePath(path) {
		return /\.md$/i.test(String(path || ""));
	}

	bumpExportPathMapGeneration() {
		this.exportPathMapGeneration = (this.exportPathMapGeneration + 1) % Number.MAX_SAFE_INTEGER;
	}

	handleExportPathVaultCreate(file) {
		// A newly created Markdown note can change collision groups. Folder
		// creation and .txt exports do not affect the source-note map.
		if (file instanceof TFile && this.isMarkdownSourcePath(file.path)) {
			this.bumpExportPathMapGeneration();
		}
	}

	handleBatchVaultRename(file, oldPath) {
		// Renaming/moving a Markdown file can change collision groups. Renaming a
		// folder can change paths for many Markdown descendants, so folder renames
		// also invalidate the cached batch map. This tracking remains active while
		// an export is running, even though selection mode has already closed.
		if (!(file instanceof TFile) || this.isMarkdownSourcePath(file.path) || this.isMarkdownSourcePath(oldPath)) {
			this.bumpExportPathMapGeneration();
		}

		if (!this.batchSelectionMode) return;
		// Selection is bound to TFile identity. A rename/move updates file.path on
		// the same object, so only the Explorer visuals need to be refreshed.
		if (file instanceof TFile && this.batchSelectedFiles.has(file)) {
			this.updateBatchPaletteState();
		}
		this.scheduleExplorerSelectionRender();
	}

	handleBatchVaultDelete(file) {
		if (!file) return;
		// Deleting a Markdown file removes it from the collision universe. Deleting
		// a folder may remove Markdown descendants, so folder deletes also
		// invalidate the cached map. Exported .txt deletions do not.
		if (!(file instanceof TFile) || this.isMarkdownSourcePath(file.path)) {
			this.bumpExportPathMapGeneration();
		}

		if (!this.batchSelectionMode) return;
		let removed = 0;
		if (file instanceof TFile) {
			if (this.batchSelectedFiles.delete(file)) removed = 1;
		} else {
			const deletedPath = String(file.path || "").replace(/\/+$/, "");
			const prefix = deletedPath ? `${deletedPath}/` : "";
			if (prefix) {
				for (const selected of Array.from(this.batchSelectedFiles)) {
					if (selected.path.startsWith(prefix)) {
						this.batchSelectedFiles.delete(selected);
						removed += 1;
					}
				}
			}
		}

		if (removed > 0) {
			this.renderExplorerSelection();
			this.updateBatchPaletteState();
			const message = this.t("batchSelectionInvalid", { count: removed });
			new Notice(message);
			this.announce(message);
		}
	}

	updateBatchPaletteState() {
		if (!this.paletteBatchButton || !this.paletteCancelButton) return;
		const count = this.batchSelectedFiles?.size || 0;
		const active = Boolean(this.batchSelectionMode);
		this.paletteBatchButton.classList.toggle("is-active", active);
		this.paletteBatchButton.setAttribute("aria-pressed", active ? "true" : "false");
		if (this.paletteBatchIconEl) {
			setIcon(this.paletteBatchIconEl, active ? "tiago7-pte-page-check" : "tiago7-pte-multi-page");
		}
		const batchLabel = active && count > 0
			? this.t("paletteBatchExportAria", { count })
			: this.t("paletteBatchStartAria");
		this.paletteBatchButton.setAttribute("aria-label", batchLabel);
		this.paletteBatchButton.setAttribute("title", batchLabel);
		this.paletteCancelButton.disabled = !active;
		if (this.paletteBatchBadge) {
			this.paletteBatchBadge.textContent = String(count);
			this.paletteBatchBadge.hidden = !active || count === 0;
		}
	}

	startBatchObserver() {
		if (this.batchObserver || typeof MutationObserver === "undefined" || !document.body) return;
		this.batchObserver = new MutationObserver(() => this.scheduleExplorerSelectionRender());
		this.batchObserver.observe(document.body, { childList: true, subtree: true });
	}

	stopBatchObserver() {
		if (this.batchObserver) {
			this.batchObserver.disconnect();
			this.batchObserver = null;
		}
		if (this.batchRenderRaf) {
			window.cancelAnimationFrame(this.batchRenderRaf);
			this.batchRenderRaf = 0;
		}
	}

	scheduleExplorerSelectionRender() {
		if (!this.batchSelectionMode || this.batchRenderRaf) return;
		this.batchRenderRaf = window.requestAnimationFrame(() => {
			this.batchRenderRaf = 0;
			if (this.batchSelectionMode) this.renderExplorerSelection();
		});
	}

	renderExplorerSelection() {
		if (!this.batchSelectionMode) return;
		for (const fileEl of document.querySelectorAll(".nav-file-title[data-path]")) {
			const path = fileEl.getAttribute("data-path") || "";
			const file = this.app.vault.getAbstractFileByPath(path);
			const selectable = file instanceof TFile && file.extension.toLocaleLowerCase() === "md";
			fileEl.classList.toggle("vpte-batch-selectable", selectable);
			const selected = selectable && this.batchSelectedFiles.has(file);
			fileEl.classList.toggle("vpte-batch-selected", selected);

			let marker = fileEl.querySelector(".vpte-batch-check");
			if (selected && !marker) {
				marker = document.createElement("span");
				marker.className = "vpte-batch-check";
				marker.textContent = "✓";
				marker.setAttribute("aria-hidden", "true");
				fileEl.appendChild(marker);
			} else if (!selected && marker) {
				marker.remove();
			}
		}
	}

	clearExplorerSelectionVisuals() {
		for (const fileEl of document.querySelectorAll(".nav-file-title.vpte-batch-selectable, .nav-file-title.vpte-batch-selected")) {
			fileEl.classList.remove("vpte-batch-selectable", "vpte-batch-selected");
			fileEl.querySelector(".vpte-batch-check")?.remove();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}


	async readRawMarkdownFile(file) {
		if (!(file instanceof TFile) || file.extension.toLocaleLowerCase() !== "md") {
			throw new Error(this.t("notMarkdownError"));
		}

		const activeFile = this.app.workspace.getActiveFile();
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		return activeFile === file && view && view.file === file && view.editor
			? view.editor.getValue()
			: await this.app.vault.cachedRead(file);
	}

	missingEmbedMessage(message) {
		return this.settings.indicateMissingEmbeds ? message : "";
	}

	extractHeadingFallback(source, headingName) {
		const wanted = normalizeHeadingForMatch(headingName);
		const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");

		for (let index = 0; index < lines.length; index += 1) {
			const match = lines[index].match(/^\s{0,3}(#{1,6})(?:\s+|$)(.*)$/);
			if (!match) continue;

			const candidate = match[2].replace(/\s+#+\s*$/, "").trim();
			if (normalizeHeadingForMatch(candidate) !== wanted) continue;

			const level = match[1].length;
			let end = index + 1;
			while (end < lines.length) {
				const nextHeading = lines[end].match(/^\s{0,3}(#{1,6})(?:\s+|$)/);
				if (nextHeading && nextHeading[1].length <= level) break;
				end += 1;
			}

			return {
				found: true,
				text: lines.slice(index + 1, end).join("\n").replace(/^\n+|\n+$/g, "")
			};
		}

		return { found: false, text: "" };
	}

	extractBlockFallback(source, blockId) {
		const escapedId = escapeRegExp(blockId);
		if (!escapedId) return { found: false, text: "" };

		const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
		const marker = new RegExp(`(?:^|\\s)\\^${escapedId}\\s*$`);
		let markerIndex = -1;

		for (let index = 0; index < lines.length; index += 1) {
			if (marker.test(lines[index])) {
				markerIndex = index;
				break;
			}
		}

		if (markerIndex === -1) return { found: false, text: "" };

		let start = markerIndex;
		while (start > 0 && lines[start - 1].trim() !== "" && !/^\s{0,3}#{1,6}(?:\s+|$)/.test(lines[start - 1])) {
			start -= 1;
		}

		let end = markerIndex + 1;
		while (end < lines.length && lines[end].trim() !== "" && !/^\s{0,3}#{1,6}(?:\s+|$)/.test(lines[end])) {
			end += 1;
		}

		return {
			found: true,
			text: removeBlockIdentifier(lines.slice(start, end).join("\n"), blockId).trim()
		};
	}

	extractEmbeddedSubpath(source, file, subpath) {
		const cache = this.app.metadataCache.getFileCache(file);

		if (cache) {
			try {
				const resolved = resolveSubpath(cache, subpath);
				if (resolved && resolved.start && Number.isFinite(resolved.start.offset)) {
					const start = Math.max(0, Math.min(source.length, resolved.start.offset));
					const rawEnd = resolved.end && Number.isFinite(resolved.end.offset)
						? resolved.end.offset
						: source.length;
					const end = Math.max(start, Math.min(source.length, rawEnd));
					let extracted = source.slice(start, end);

					if (resolved.type === "heading") {
						extracted = removeLeadingHeadingMarkup(extracted);
					} else if (resolved.type === "block") {
						extracted = removeBlockIdentifier(extracted, subpath.replace(/^#\^/, ""));
					}

					return { found: true, text: extracted.trim() };
				}
			} catch (error) {
				console.warn("tiago7 Plain Text Export Plugin Obsidian — falha ao resolver subcaminho pelo cache:", error);
			}
		}

		if (subpath.startsWith("#^")) {
			return this.extractBlockFallback(source, safeDecodeURIComponent(subpath.slice(2)));
		}

		if (subpath.startsWith("#")) {
			return this.extractHeadingFallback(source, safeDecodeURIComponent(subpath.slice(1)));
		}

		return { found: false, text: "" };
	}

	async expandSingleEmbed(rawInner, sourceFile, stack, depth) {
		const linktext = splitWikilinkAlias(rawInner);
		const parsed = parseLinktext(linktext);
		const linkPath = String(parsed.path || "").trim();
		const subpath = String(parsed.subpath || "").trim();
		const displayName = getEmbedDisplayName(linkPath, sourceFile, this.t("currentNote"));
		const explicitExtension = getExplicitExtension(linkPath);

		let targetFile = null;
		if (!linkPath) {
			targetFile = sourceFile;
		} else {
			targetFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, sourceFile.path);
		}

		if (!(targetFile instanceof TFile)) {
			if (explicitExtension && explicitExtension !== "md") {
				return this.t("attachmentEmbed", { name: linkPath.replace(/\\/g, "/").split("/").pop() || linkPath });
			}

			return this.missingEmbedMessage(this.t("missingNoteEmbed", { name: displayName }));
		}

		if (targetFile.extension.toLocaleLowerCase() !== "md") {
			return this.t("attachmentEmbed", { name: targetFile.name });
		}

		const referenceKey = getEmbedKey(targetFile, subpath);
		if (stack.has(referenceKey)) {
			return this.t("circularEmbed", { name: targetFile.basename });
		}

		if (depth >= MAX_EMBED_DEPTH) {
			return this.t("embedDepth", { name: targetFile.basename });
		}

		let embeddedSource = await this.readRawMarkdownFile(targetFile);
		if (subpath) {
			const extracted = this.extractEmbeddedSubpath(embeddedSource, targetFile, subpath);
			if (!extracted.found) {
				if (subpath.startsWith("#^")) {
					return this.missingEmbedMessage(this.t("missingBlock", { name: `${displayName}${subpath}` }));
				}
				return this.missingEmbedMessage(this.t("missingSection", { name: `${displayName}${subpath}` }));
			}
			embeddedSource = extracted.text;
		} else {
			embeddedSource = stripEmbeddedFrontmatter(embeddedSource);
		}

		const nextStack = new Set(stack);
		nextStack.add(referenceKey);
		const expanded = await this.expandEmbeddedNotes(embeddedSource, targetFile, nextStack, depth + 1);
		return shiftEmbeddedHeadings(expanded).trim();
	}

	async expandEmbedsInSegment(segment, sourceFile, stack, depth) {
		let output = "";
		let lastIndex = 0;
		const pattern = new RegExp(EMBED_PATTERN.source, "g");
		let match;

		while ((match = pattern.exec(segment)) !== null) {
			output += segment.slice(lastIndex, match.index);
			output += await this.expandSingleEmbed(match[1], sourceFile, stack, depth);
			lastIndex = match.index + match[0].length;
		}

		output += segment.slice(lastIndex);
		return output;
	}

	async expandEmbeddedNotes(source, sourceFile, stack, depth = 0) {
		const text = String(source || "");
		const lines = text.match(/[^\n]*(?:\n|$)/g) || [];
		let output = "";
		let inFence = false;
		let fenceCharacter = "";
		let fenceLength = 0;

		for (const line of lines) {
			if (!line) continue;
			const lineWithoutBreak = line.endsWith("\n") ? line.slice(0, -1) : line;
			const fence = lineWithoutBreak.match(/^\s*(`{3,}|~{3,})/);

			if (fence) {
				const marker = fence[1];
				if (!inFence) {
					inFence = true;
					fenceCharacter = marker[0];
					fenceLength = marker.length;
				} else if (marker[0] === fenceCharacter && marker.length >= fenceLength) {
					inFence = false;
					fenceCharacter = "";
					fenceLength = 0;
				}
				output += line;
				continue;
			}

			if (inFence) {
				output += line;
				continue;
			}

			output += await this.expandEmbedsInSegment(line, sourceFile, stack, depth);
		}

		return output;
	}

	async readNoteFile(file) {
		const source = await this.readRawMarkdownFile(file);
		const expandedSource = this.settings.expandEmbeddedNotes
			? await this.expandEmbeddedNotes(source, file, new Set([getEmbedKey(file, "")]))
			: source;

		return {
			file,
			text: cleanMarkdown(expandedSource, this.settings)
		};
	}

	getPathCollisionKey(path) {
		return normalizePath(path || "").normalize("NFC").toLowerCase();
	}

	compareSourcePaths(a, b) {
		const normalizedA = normalizePath(a || "").normalize("NFC");
		const normalizedB = normalizePath(b || "").normalize("NFC");
		const foldedA = normalizedA.toLowerCase();
		const foldedB = normalizedB.toLowerCase();

		if (foldedA < foldedB) return -1;
		if (foldedA > foldedB) return 1;
		if (normalizedA < normalizedB) return -1;
		if (normalizedA > normalizedB) return 1;
		return 0;
	}

	getNumberedExportPath(path, number) {
		const normalized = normalizePath(path);
		const slashIndex = normalized.lastIndexOf("/");
		const folder = slashIndex === -1 ? "" : normalized.slice(0, slashIndex + 1);
		const filename = slashIndex === -1 ? normalized : normalized.slice(slashIndex + 1);
		const dotIndex = filename.toLowerCase().endsWith(".txt") ? filename.length - 4 : -1;
		const stem = dotIndex === -1 ? filename : filename.slice(0, dotIndex);
		const extension = dotIndex === -1 ? "" : filename.slice(dotIndex);
		return normalizePath(`${folder}${stem} (${number})${extension}`);
	}

	buildDeterministicExportPathMap() {
		const markdownFiles = this.app.vault.getMarkdownFiles()
			.filter((file) => file instanceof TFile && file.extension === "md");
		const entries = markdownFiles.map((file) => {
			const preferredPath = this.getExportPath(file);
			return {
				file,
				preferredPath,
				collisionKey: this.getPathCollisionKey(preferredPath)
			};
		});

		const reservedPreferredKeys = new Set(entries.map((entry) => entry.collisionKey));
		const groups = new Map();

		for (const entry of entries) {
			if (!groups.has(entry.collisionKey)) groups.set(entry.collisionKey, []);
			groups.get(entry.collisionKey).push(entry);
		}

		const assigned = new Map();
		const usedAssignedKeys = new Set();
		const groupKeys = Array.from(groups.keys()).sort();

		for (const groupKey of groupKeys) {
			const group = groups.get(groupKey).slice().sort((a, b) =>
				this.compareSourcePaths(a.file.path, b.file.path)
			);

			for (let index = 0; index < group.length; index += 1) {
				const entry = group[index];
				let finalPath = entry.preferredPath;

				if (index > 0) {
					let number = 2;
					finalPath = this.getNumberedExportPath(entry.preferredPath, number);
					let finalKey = this.getPathCollisionKey(finalPath);

					while (reservedPreferredKeys.has(finalKey) || usedAssignedKeys.has(finalKey)) {
						number += 1;
						finalPath = this.getNumberedExportPath(entry.preferredPath, number);
						finalKey = this.getPathCollisionKey(finalPath);
					}
				}

				const finalKey = this.getPathCollisionKey(finalPath);
				usedAssignedKeys.add(finalKey);
				assigned.set(entry.file.path, normalizePath(finalPath));
			}
		}

		return assigned;
	}

	getStableExportPath(file, pathMap = null) {
		const resolvedMap = pathMap || this.buildDeterministicExportPathMap();
		return resolvedMap.get(file.path) || this.getExportPath(file);
	}

	assertCurrentBatchMarkdownFile(file) {
		if (!this.isCurrentSelectedMarkdownFile(file)) {
			throw new Error(this.t("batchSourceChangedDuringExport"));
		}
	}

	refreshBatchExportPathState(state) {
		state.pathMap = this.buildDeterministicExportPathMap();
		state.generation = this.exportPathMapGeneration;
	}

	getBatchExportPathFromState(file, state) {
		if (!state.pathMap || state.generation !== this.exportPathMapGeneration) {
			this.refreshBatchExportPathState(state);
		}

		let exportPath = state.pathMap.get(file.path);
		if (!exportPath) {
			// Missing paths are never allowed to fall back to getExportPath(), because
			// doing so can bypass global collision resolution. Rebuild once from the
			// current vault state; if the same TFile still has no mapping, fail closed.
			this.refreshBatchExportPathState(state);
			exportPath = state.pathMap.get(file.path);
		}

		if (!exportPath) {
			throw new Error(this.t("batchSourceChangedDuringExport"));
		}

		return {
			exportPath: normalizePath(exportPath),
			generation: state.generation,
			sourcePath: file.path
		};
	}

	async resolveCurrentBatchExportPath(file, batchPathState) {
		for (let attempt = 0; attempt < MAX_BATCH_DESTINATION_RETRIES; attempt += 1) {
			this.assertCurrentBatchMarkdownFile(file);
			const resolved = this.getBatchExportPathFromState(file, batchPathState);

			const folderPath = resolved.exportPath.includes("/")
				? resolved.exportPath.slice(0, resolved.exportPath.lastIndexOf("/"))
				: "";
			await this.ensureFolder(folderPath);

			this.assertCurrentBatchMarkdownFile(file);
			if (file.path !== resolved.sourcePath) continue;
			if (this.exportPathMapGeneration !== resolved.generation) continue;

			return resolved.exportPath;
		}

		throw new Error(this.t("batchDestinationChangedDuringExport"));
	}

	async exportFiles(files) {
		const markdownFiles = files.filter((file) => file instanceof TFile && file.extension === "md");
		const usedExportTargets = new Map();
		const batchPathState = { pathMap: null, generation: -1 };
		const errors = [];
		let exported = 0;

		for (const file of markdownFiles) {
			try {
				this.assertCurrentBatchMarkdownFile(file);
				const result = await this.readNoteFile(file);
				this.assertCurrentBatchMarkdownFile(file);

				const exportPath = await this.resolveCurrentBatchExportPath(file, batchPathState);
				this.assertCurrentBatchMarkdownFile(file);

				const exportTargetKey = this.getPathCollisionKey(exportPath);
				const priorFile = usedExportTargets.get(exportTargetKey);
				if (priorFile && priorFile !== file) {
					throw new Error(this.t("batchDestinationChangedDuringExport"));
				}

				// Reserve the target before writing. If the write fails, later items in
				// this same batch are still not allowed to reuse the same destination.
				usedExportTargets.set(exportTargetKey, file);
				await this.writeAndVerifyTextFile(exportPath, result.text);
				exported += 1;
			} catch (error) {
				errors.push({
					file: file.path,
					message: error && error.message ? error.message : String(error)
				});
			}
		}

		if (errors.length === 0) {
			const message = this.t("batchSuccess", { count: exported });
			new Notice(message);
			this.announce(message);
		} else {
			console.error("tiago7 Plain Text Export Plugin Obsidian — exportação múltipla:", errors);
			const message = this.t("batchPartial", { exported, failed: errors.length });
			new Notice(message);
			this.announce(message);
		}

		return {
			exported,
			failed: errors.length,
			errors
		};
	}

	async readCurrentNote() {
		const file = this.app.workspace.getActiveFile();
		if (!(file instanceof TFile) || file.extension !== "md") {
			new Notice(this.t("openMarkdownBeforeExport"));
			return null;
		}

		return await this.readNoteFile(file);
	}

	async ensureFolder(folderPath) {
		const normalized = normalizePath(folderPath || "");
		if (!normalized) return;

		const parts = normalized.split("/").filter(Boolean);
		let current = "";

		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(current);

			if (!existing) {
				await this.app.vault.createFolder(current);
			} else if (existing instanceof TFile) {
				throw new Error(this.t("createFolderError", { path: current }));
			}
		}
	}

	getExportPath(file) {
		const exportRoot = normalizePath(this.settings.exportFolder || DEFAULT_SETTINGS.exportFolder);
		const sourceFolder = file.parent && file.parent.path !== "/" ? file.parent.path : "";
		const useSourceFolder = this.settings.preserveSourceFolders && sourceFolder;
		const relativeFolder = useSourceFolder ? `${exportRoot}/${sourceFolder}` : exportRoot;
		return normalizePath(`${relativeFolder}/${file.basename}.txt`);
	}

	async writeAndVerifyTextFile(exportPath, text) {
		const normalized = normalizePath(exportPath);
		const adapter = this.app.vault.adapter;
		const abstractFile = this.app.vault.getAbstractFileByPath(normalized);

		if (abstractFile instanceof TFile) {
			await this.app.vault.modify(abstractFile, text);
		} else if (abstractFile) {
			throw new Error(this.t("folderCollision"));
		} else {
			const alreadyExists = await adapter.exists(normalized);
			if (alreadyExists) {
				await adapter.write(normalized, text);
			} else {
				await this.app.vault.create(normalized, text);
			}
		}

		const existsAfterWrite = await adapter.exists(normalized);
		if (!existsAfterWrite) {
			throw new Error(this.t("writeNotConfirmed"));
		}

		const savedText = await adapter.read(normalized);
		if (savedText !== text) {
			throw new Error(this.t("verifyMismatch"));
		}
	}


	async exportCurrentNote() {
		try {
			const result = await this.readCurrentNote();
			if (!result) return;

			const exportPathMap = this.buildDeterministicExportPathMap();
			const exportPath = this.getStableExportPath(result.file, exportPathMap);
			const folderPath = exportPath.includes("/")
				? exportPath.slice(0, exportPath.lastIndexOf("/"))
				: "";

			await this.ensureFolder(folderPath);

			await this.writeAndVerifyTextFile(exportPath, result.text);

			const message = this.t("exportSuccess", { path: exportPath });
			new Notice(message);
			this.announce(message);
		} catch (error) {
			console.error("tiago7 Plain Text Export Plugin Obsidian:", error);
			new Notice(this.t("exportFailure", { message: error && error.message ? error.message : error }));
		}
	}

	async copyCurrentNote() {
		try {
			const result = await this.readCurrentNote();
			if (!result) return;

			const copied = await copyToClipboard(result.text);
			if (copied) {
				const message = this.t("copySuccess");
				new Notice(message);
				this.announce(message);
			} else {
				new Notice(this.t("copyAutoFail"));
			}
		} catch (error) {
			console.error("tiago7 Plain Text Export Plugin Obsidian:", error);
			new Notice(this.t("copyFailure", { message: error && error.message ? error.message : error }));
		}
	}
};
