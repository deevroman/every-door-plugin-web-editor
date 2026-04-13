import JSZip from "jszip";
import { Compartment, EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { linter } from "@codemirror/lint";
import { EditorView, keymap } from "@codemirror/view";
import { xml as xmlLanguage } from "@codemirror/lang-xml";
import { yaml as yamlLanguage } from "@codemirror/lang-yaml";
import { tags } from "@lezer/highlight";
import { isMap, parseDocument } from "yaml";

const STORAGE_KEY = "everydoor-plugin-editor-state-v3";
const SIDEBAR_WIDTH_KEY = "everydoor-plugin-editor-sidebar-width-v1";
const SIDEBAR_COLLAPSED_KEY = "everydoor-plugin-editor-sidebar-collapsed-v1";
const SVG_PREVIEW_WIDTH_KEY = "everydoor-plugin-editor-svg-preview-width-v1";
const SVG_PREVIEW_COLOR_KEY = "everydoor-plugin-editor-svg-preview-color-v1";
const SIDEBAR_MIN_WIDTH = 260;
const SIDEBAR_MAX_WIDTH = 560;
const DEFAULT_SIDEBAR_WIDTH = 360;
const SVG_PREVIEW_MIN_WIDTH = 160;
const SVG_PREVIEW_MAX_WIDTH = 560;
const DEFAULT_SVG_PREVIEW_WIDTH = 260;
const DEFAULT_SVG_PREVIEW_COLOR = "#ffffff";
const PREVIEW_SCALE_FACTOR = 2;
const PREVIEW_MAX_WIDTH = 820;
const PREVIEW_MAX_HEIGHT = 820;
const SHOW_PREVIEW_COLOR_CONTROL = false;

const TEXT_EXTENSIONS = new Set([
  "yaml",
  "yml",
  "json",
  "txt",
  "md",
  "xml",
  "csv",
  "js",
  "ts",
  "html",
  "css",
  "license",
]);

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
const SVG_EXTENSION = "svg";
const PROTECTED_ROOT_FOLDERS = new Set(["icons", "langs"]);
const PROTECTED_FILES = new Set(["plugin.yaml"]);
const PLUGIN_TOP_LEVEL_KEYS = new Set([
  "id",
  "name",
  "version",
  "api",
  "description",
  "author",
  "icon",
  "experimental",
  "homepage",
  "source",
  "intro",
  "kinds",
  "modes",
  "imagery",
  "overlays",
  "presets",
]);
const PLUGIN_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const PINHEAD_BILLBOARD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15" fill="currentColor">
  <path d="M1 2L14 2L14 10.5L1 10.5L1 2ZM2.5 3C2.22 3 2 3.22 2 3.5C2 3.78 2.22 4 2.5 4L5.5 4C5.78 4 6 3.78 6 3.5C6 3.22 5.78 3 5.5 3L2.5 3ZM2.5 5C2.22 5 2 5.22 2 5.5C2 5.78 2.22 6 2.5 6L3.5 6C3.78 6 4 5.78 4 5.5C4 5.22 3.78 5 3.5 5L2.5 5ZM5.5 5C5.22 5 5 5.22 5 5.5C5 5.78 5.22 6 5.5 6L9.5 6C9.78 6 10 5.78 10 5.5C10 5.22 9.78 5 9.5 5L5.5 5ZM2.5 7C2.22 7 2 7.22 2 7.5C2 7.78 2.22 8 2.5 8L7.5 8C7.78 8 8 7.78 8 7.5C8 7.22 7.78 7 7.5 7L2.5 7ZM6 11L9 11L9 14L6 14L6 11ZM10 11L13 11L13 12L10 12L10 11ZM2 11L5 11L5 12L2 12L2 11Z"/>
</svg>
`;
const PINHEAD_STREET_LAMP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15" fill="currentColor">
  <path d="M6 12L7 12C7.55 12 8 12.45 8 13L8 14L2 14L2 13C2 12.45 2.45 12 3 12L4 12L4 4C4 2.34 5.34 1 7 1L13 1L13 3C13 4.1 12.1 5 11 5L10 5C8.9 5 8 4.1 8 3L7.5 3C6.67 3 6 3.67 6 4.5L6 12ZM9 2L9 3C9 3.55 9.45 4 10 4L11 4C11.55 4 12 3.55 12 3L12 2L9 2L9 2Z"/>
</svg>
`;
const PINHEAD_DROPLET_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15">
  <path d="M7.5 14C9.58 14 12 12.71 12 9.43C12 7.21 8.54 2.29 7.5 1C6.58 2.29 3 7.09 3 9.43C3 12.71 5.42 14 7.5 14Z"/>
</svg>
`;

const I18N = {
  en: {
    page_title: "EveryDoor Plugin Web Editor",
    app_title: "EveryDoor Plugin Editor",
    open_another_plugin: "Open Another Plugin",
    open_docs: "Plugin Docs",
    publish_plugin: "Publish Plugin",
    open_archive_file: "Open Archive File",
    open_archive_link: "Download by Link",
    open_github_repo: "Open GitHub Repository Files",
    open_from_template: "Create from Template",
    dropzone_aria: "Drop plugin archive",
    dropzone_title_html: "Drop <code>.edp</code> or <code>.zip</code> file here",
    dropzone_subtitle: "or click to choose from your device",
    sidebar_title: "Archive Files",
    sidebar_toggle_aria: "Collapse or expand file list",
    action_create_item: "Create file or folder",
    file_tree_aria: "Archive file tree",
    download_archive: "Download archive",
    download_modified_archive: "Download modified archive",
    default_archive_name: "No archive",
    select_file: "Select a file",
    undo_file_changes: "Undo File Changes",
    editor_file_aria: "File editor",
    editor_svg_aria: "SVG editor",
    image_preview_alt: "Selected file preview",
    svg_preview_alt: "SVG preview",
    binary_cant_edit: "This file type cannot be edited here.",
    binary_hint: "You can keep it unchanged and include it in exported archive.",
    empty_select_file: "Select a file from the list to start editing.",
    meta_text: "Text file",
    meta_image: "Image preview",
    meta_svg: "SVG: code + preview",
    meta_binary: "Binary file",
    meta_modified: "{base} • modified",
    meta_modified_short: "modified",
    error_protected_folder: "This folder is protected and cannot be deleted.",
    error_protected_file: "This file is protected and cannot be deleted.",
    error_cannot_delete_protected_in_folder: 'Cannot delete folder because it contains protected file "{path}".',
    confirm_delete_file: 'Delete file "{path}"?',
    confirm_delete_folder: 'Delete folder "{path}" and its content?',
    error_folder_name_empty: "Folder name cannot be empty.",
    error_file_name_empty: "File name cannot be empty.",
    error_name_empty: "Name cannot be empty.",
    error_file_exists: "A file with this name already exists.",
    error_folder_exists: "Folder already exists.",
    error_file_or_folder_exists: "A file or folder with this name already exists.",
    prompt_new_item: "New item name. Add '/' at the end to create a folder.",
    prompt_new_file_name: "New file name",
    prompt_new_folder_name: "New folder name",
    error_simple_file_name: "Use a simple file name without '/'.",
    error_simple_folder_name: "Use a simple folder name without '/'.",
    error_choose_archive: "Please choose a .edp or .zip archive.",
    prompt_archive_url: "Paste archive URL (.edp/.zip)",
    error_archive_url_required: "Archive URL is required.",
    error_download_url: "Cannot download archive by link: {message}",
    prompt_github_repo: "Enter GitHub repository URL or owner/repo",
    prompt_github_branch: "Branch or tag",
    loading_github: "Loading plugin from GitHub...",
    error_github_repo_required: "GitHub repository is required.",
    error_github_repo_format: "Invalid repository format. Use owner/repo or GitHub URL.",
    error_open_github_repo: "Cannot open GitHub repository: {message}",
    archive_has_no_files: "Archive has no files",
    error_revert_path_occupied: "Cannot revert path: original path is occupied.",
    error_persist_state: "Cannot persist state: {message}",
    error_open_archive: "Cannot open archive: {message}",
    error_export_archive: "Cannot export archive: {message}",
    action_pinhead: "Create new-icon.svg via Pinhead",
    action_find_pinhead: "Find in Pinhead",
    action_upload_from_disk: "Upload from disk",
    action_rename_folder: "Rename folder",
    action_rename_file: "Rename file",
    action_delete_folder: "Delete folder",
    action_delete_file: "Delete file",
    create_sample_plugin: "Create Example Plugin",
    sample_archive_name: "example-plugin.edp",
    panel_resizer_aria: "Resize panels",
    svg_pane_resizer_aria: "Resize SVG preview panel",
    preview_color_label: "Preview Color",
    preview_color_title: "Pick color for SVG preview",
    error_protected_file_rename: "This file is protected and cannot be renamed.",
    yaml_lint_parse_error: "YAML: {message}",
    yaml_lint_unknown_key: 'Unknown top-level key "{key}".',
    yaml_lint_missing_id: 'Missing required key "id".',
    yaml_lint_invalid_id: '"id" can include only latin letters, numbers, "-" and "_".',
    yaml_lint_version_number: '"version" should be numeric.',
  },
  ru: {
    page_title: "Веб-редактор плагинов EveryDoor",
    app_title: "Редактор плагинов EveryDoor",
    open_another_plugin: "Открыть другой плагин",
    open_docs: "Документация",
    publish_plugin: "Опубликовать плагин",
    open_archive_file: "Открыть файл архива",
    open_archive_link: "Скачать по ссылке",
    open_github_repo: "Открыть файлы репозитория на GitHub",
    open_from_template: "Создать из шаблона",
    dropzone_aria: "Перетащите архив плагина",
    dropzone_title_html: "Перетащите файл <code>.edp</code> или <code>.zip</code>",
    dropzone_subtitle: "или нажмите, чтобы выбрать файл на устройстве",
    sidebar_title: "Файлы архива",
    sidebar_toggle_aria: "Свернуть или развернуть список файлов",
    action_create_item: "Создать файл или папку",
    file_tree_aria: "Дерево файлов архива",
    download_archive: "Скачать архив",
    download_modified_archive: "Скачать изменённый архив",
    default_archive_name: "Архив не выбран",
    select_file: "Выберите файл",
    undo_file_changes: "Отменить изменения файла",
    editor_file_aria: "Редактор файла",
    editor_svg_aria: "SVG-редактор",
    image_preview_alt: "Предпросмотр выбранного файла",
    svg_preview_alt: "Предпросмотр SVG",
    binary_cant_edit: "Этот тип файла нельзя редактировать здесь.",
    binary_hint: "Можно оставить его без изменений и включить в экспортируемый архив.",
    empty_select_file: "Выберите файл из списка, чтобы начать редактирование.",
    meta_text: "Текстовый файл",
    meta_image: "Предпросмотр изображения",
    meta_svg: "SVG: код + предпросмотр",
    meta_binary: "Бинарный файл",
    meta_modified: "{base} • изменён",
    meta_modified_short: "изменён",
    error_protected_folder: "Эту папку нельзя удалить.",
    error_protected_file: "Этот файл нельзя удалить.",
    error_cannot_delete_protected_in_folder: 'Нельзя удалить папку, потому что в ней есть защищённый файл "{path}".',
    confirm_delete_file: 'Удалить файл "{path}"?',
    confirm_delete_folder: 'Удалить папку "{path}" и всё её содержимое?',
    error_folder_name_empty: "Имя папки не может быть пустым.",
    error_file_name_empty: "Имя файла не может быть пустым.",
    error_name_empty: "Имя не может быть пустым.",
    error_file_exists: "Файл с таким именем уже существует.",
    error_folder_exists: "Папка с таким именем уже существует.",
    error_file_or_folder_exists: "Файл или папка с таким именем уже существуют.",
    prompt_new_item: "Имя нового элемента. Добавьте '/' в конце, чтобы создать папку.",
    prompt_new_file_name: "Новое имя файла",
    prompt_new_folder_name: "Новое имя папки",
    error_simple_file_name: "Используйте простое имя файла без '/'.",
    error_simple_folder_name: "Используйте простое имя папки без '/'.",
    error_choose_archive: "Выберите архив .edp или .zip.",
    prompt_archive_url: "Вставьте ссылку на архив (.edp/.zip)",
    error_archive_url_required: "Ссылка на архив обязательна.",
    error_download_url: "Не удалось скачать архив по ссылке: {message}",
    prompt_github_repo: "Введите URL GitHub-репозитория или owner/repo",
    prompt_github_branch: "Ветка или тег",
    loading_github: "Загрузка плагина с GitHub...",
    error_github_repo_required: "Репозиторий GitHub обязателен.",
    error_github_repo_format: "Некорректный формат репозитория. Используйте owner/repo или URL GitHub.",
    error_open_github_repo: "Не удалось открыть GitHub-репозиторий: {message}",
    archive_has_no_files: "В архиве нет файлов",
    error_revert_path_occupied: "Невозможно откатить путь: исходный путь уже занят.",
    error_persist_state: "Не удалось сохранить состояние: {message}",
    error_open_archive: "Не удалось открыть архив: {message}",
    error_export_archive: "Не удалось экспортировать архив: {message}",
    action_pinhead: "Создать new-icon.svg через Pinhead",
    action_find_pinhead: "найти в Pinhead",
    action_upload_from_disk: "Загрузить с диска",
    action_rename_folder: "Переименовать папку",
    action_rename_file: "Переименовать файл",
    action_delete_folder: "Удалить папку",
    action_delete_file: "Удалить файл",
    create_sample_plugin: "Создать плагин-пример",
    sample_archive_name: "example-plugin.edp",
    panel_resizer_aria: "Изменить ширину панелей",
    svg_pane_resizer_aria: "Изменить ширину SVG-предпросмотра",
    preview_color_label: "Цвет предпросмотра",
    preview_color_title: "Выберите цвет для SVG-предпросмотра",
    error_protected_file_rename: "Этот файл нельзя переименовать.",
    yaml_lint_parse_error: "YAML: {message}",
    yaml_lint_unknown_key: 'Неизвестный ключ верхнего уровня "{key}".',
    yaml_lint_missing_id: 'Отсутствует обязательный ключ "id".',
    yaml_lint_invalid_id: 'В "id" разрешены только латиница, цифры, "-" и "_".',
    yaml_lint_version_number: 'Значение "version" должно быть числом.',
  },
};

const browserLanguages = [navigator.language, ...(navigator.languages || [])]
  .filter(Boolean)
  .map((value) => String(value).toLowerCase());

const locale = browserLanguages.some((value) => value.startsWith("ru")) ? "ru" : "en";

function t(key, params = {}) {
  let template = I18N[locale]?.[key] ?? I18N.en[key] ?? key;
  Object.entries(params).forEach(([paramKey, value]) => {
    template = template.replaceAll(`{${paramKey}}`, String(value));
  });
  return template;
}

const textDecoder = new TextDecoder("utf-8");
const textEncoder = new TextEncoder();

const ICONS = {
  plus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a.5.5 0 0 1 .5.5V7.5H14.5a.5.5 0 0 1 0 1H8.5v6a.5.5 0 0 1-1 0v-6H1.5a.5.5 0 0 1 0-1H7.5V1.5A.5.5 0 0 1 8 1z"/></svg>',
  pencil:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.56 3.59l-2.15-2.15.94-.94a.5.5 0 0 1 .706 0z"/><path d="M13.853 4.297 11.703 2.147 4.5 9.35V11.5h2.15z"/><path fill-rule="evenodd" d="M1 13.5V16h2.5l7.096-7.096-2.5-2.5L1 13.5z"/></svg>',
  pinhead:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0 0 1h3.793L5.146 11.782a.5.5 0 1 0 .708.708L13.136 5.207V9a.5.5 0 0 0 1 0V4a.5.5 0 0 0-.5-.5h-5z"/><path fill-rule="evenodd" d="M13.5 13a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5H8a.5.5 0 0 0 0-1H4A1.5 1.5 0 0 0 2.5 4v9A1.5 1.5 0 0 0 4 14.5h9a1.5 1.5 0 0 0 1.5-1.5V9a.5.5 0 0 0-1 0v4z"/></svg>',
  trash:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 5.5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 1 1 0-2H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4 4v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4H4z"/></svg>',
  preview:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2h-13zm13 1a.5.5 0 0 1 .5.5v5.793l-2.146-2.147a.5.5 0 0 0-.708 0L9.5 9.793l-1.646-1.647a.5.5 0 0 0-.708 0L1 14V3.5a.5.5 0 0 1 .5-.5h13z"/><path d="M4.5 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>',
  chevronRight:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M6.646 3.646a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 1 1-.708-.708L10.293 8 6.646 4.354a.5.5 0 0 1 0-.708z"/></svg>',
  chevronDown:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M1.646 5.646a.5.5 0 0 1 .708 0L8 11.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>',
};

const state = {
  archiveName: "",
  files: new Map(),
  explicitFolders: new Set(),
  activePath: null,
  structureChanged: false,
  originalFilePaths: new Set(),
  originalFolders: new Set(),
  collapsedFolders: new Set(),
  sidebarCollapsed: false,
  svgPreviewColor: DEFAULT_SVG_PREVIEW_COLOR,
};

let persistTimer = null;

const dropzone = document.getElementById("dropzone");
const appTitle = document.getElementById("appTitle");
const dropzoneTitle = document.getElementById("dropzoneTitle");
const dropzoneSubtitle = document.getElementById("dropzoneSubtitle");
const createSampleBtn = document.getElementById("createSampleBtn");
const fileInput = document.getElementById("fileInput");
const docsBtn = document.getElementById("docsBtn");
const publishPluginBtn = document.getElementById("publishPluginBtn");
const openAnotherBtn = document.getElementById("openAnotherBtn");
const openAnotherMenu = document.getElementById("openAnotherMenu");
const openArchiveFileBtn = document.getElementById("openArchiveFileBtn");
const openArchiveLinkBtn = document.getElementById("openArchiveLinkBtn");
const openGithubRepoBtn = document.getElementById("openGithubRepoBtn");
const openTemplateBtn = document.getElementById("openTemplateBtn");
const workspace = document.getElementById("workspace");
const panelResizer = document.getElementById("panelResizer");
const svgPaneResizer = document.getElementById("svgPaneResizer");
const sidebarPanel = document.querySelector(".sidebar");
const sidebarTitle = document.getElementById("sidebarTitle");
const fileTree = document.getElementById("fileTree");
const addRootBtn = document.getElementById("addRootBtn");
const archiveName = document.getElementById("archiveName");
const activeFileName = document.getElementById("activeFileName");
const fileMeta = document.getElementById("fileMeta");
const revertFileBtn = document.getElementById("revertFileBtn");
const previewColorControl = document.getElementById("previewColorControl");
const previewColorLabel = document.getElementById("previewColorLabel");
const previewColorInput = document.getElementById("previewColorInput");
const textEditor = document.getElementById("textEditor");
const imagePreview = document.getElementById("imagePreview");
const svgEditor = document.getElementById("svgEditor");
const svgPreview = document.getElementById("svgPreview");
const downloadBtn = document.getElementById("downloadBtn");
const binaryTitle = document.getElementById("binaryTitle");
const binaryHint = document.getElementById("binaryHint");
const emptyHint = document.getElementById("emptyHint");
const iconsUploadInput = document.createElement("input");
iconsUploadInput.type = "file";
iconsUploadInput.hidden = true;
iconsUploadInput.multiple = true;
document.body.appendChild(iconsUploadInput);

const panes = {
  empty: document.getElementById("emptyPane"),
  text: document.getElementById("editorPane"),
  image: document.getElementById("imagePane"),
  svg: document.getElementById("svgPane"),
  binary: document.getElementById("binaryPane"),
};

const textLanguageCompartment = new Compartment();
const textLintCompartment = new Compartment();
const svgLanguageCompartment = new Compartment();
const svgLintCompartment = new Compartment();
let textEditorView = null;
let svgEditorView = null;
let suppressEditorUpdate = false;

function setStatus(message, isError = false) {
  if (isError) {
    console.error(message);
  }
}

function applyStaticTranslations() {
  document.documentElement.lang = locale;
  document.title = t("page_title");

  if (appTitle) {
    appTitle.textContent = t("app_title");
  }

  openAnotherBtn.textContent = t("open_another_plugin");
  if (docsBtn) {
    docsBtn.textContent = t("open_docs");
  }
  if (publishPluginBtn) {
    publishPluginBtn.textContent = t("publish_plugin");
  }
  if (openArchiveFileBtn) {
    openArchiveFileBtn.textContent = t("open_archive_file");
  }
  if (openArchiveLinkBtn) {
    openArchiveLinkBtn.textContent = t("open_archive_link");
  }
  if (openGithubRepoBtn) {
    openGithubRepoBtn.textContent = t("open_github_repo");
  }
  if (openTemplateBtn) {
    openTemplateBtn.textContent = t("open_from_template");
  }
  dropzone.setAttribute("aria-label", t("dropzone_aria"));
  if (dropzoneTitle) {
    dropzoneTitle.innerHTML = t("dropzone_title_html");
  }
  if (dropzoneSubtitle) {
    dropzoneSubtitle.textContent = t("dropzone_subtitle");
  }
  if (createSampleBtn) {
    createSampleBtn.textContent = t("create_sample_plugin");
  }

  if (sidebarTitle) {
    sidebarTitle.textContent = t("sidebar_title");
    sidebarTitle.setAttribute("role", "button");
    sidebarTitle.setAttribute("tabindex", "0");
    sidebarTitle.setAttribute("aria-label", t("sidebar_toggle_aria"));
  }
  if (panelResizer) {
    panelResizer.setAttribute("aria-label", t("panel_resizer_aria"));
  }
  if (svgPaneResizer) {
    svgPaneResizer.setAttribute("aria-label", t("svg_pane_resizer_aria"));
  }

  const createItemTitle = t("action_create_item");
  addRootBtn.setAttribute("title", createItemTitle);
  addRootBtn.setAttribute("aria-label", createItemTitle);
  fileTree.setAttribute("aria-label", t("file_tree_aria"));

  revertFileBtn.textContent = t("undo_file_changes");
  textEditor.setAttribute("aria-label", t("editor_file_aria"));
  svgEditor.setAttribute("aria-label", t("editor_svg_aria"));
  imagePreview.setAttribute("alt", t("image_preview_alt"));
  svgPreview.setAttribute("alt", t("svg_preview_alt"));
  if (previewColorLabel) {
    previewColorLabel.textContent = t("preview_color_label");
  }
  if (previewColorInput) {
    const title = t("preview_color_title");
    previewColorInput.setAttribute("title", title);
    previewColorInput.setAttribute("aria-label", title);
  }

  if (binaryTitle) {
    binaryTitle.textContent = t("binary_cant_edit");
  }
  if (binaryHint) {
    binaryHint.textContent = t("binary_hint");
  }
  if (emptyHint) {
    emptyHint.textContent = t("empty_select_file");
  }
}

function getExtension(path) {
  const parts = path.toLowerCase().split(".");
  if (parts.length <= 1) {
    return "";
  }
  return parts.pop();
}

function normalizePath(path) {
  return path
    .split("/")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .join("/");
}

function normalizeFolderPath(path) {
  return normalizePath(path.replace(/\/+$/, ""));
}

function getParentPath(path) {
  const index = path.lastIndexOf("/");
  if (index < 0) {
    return "";
  }
  return path.slice(0, index);
}

function joinPath(base, tail) {
  return normalizePath(base ? `${base}/${tail}` : tail);
}

function detectKind(path) {
  const ext = getExtension(path);

  if (ext === SVG_EXTENSION) {
    return "svg";
  }

  if (IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    return "text";
  }

  const fileName = path.toLowerCase().split("/").pop() || "";
  if (fileName === "license") {
    return "text";
  }

  return "binary";
}

function getMimeType(path) {
  const ext = getExtension(path);
  const map = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    yaml: "text/yaml",
    yml: "text/yaml",
    json: "application/json",
    txt: "text/plain",
    md: "text/markdown",
  };
  return map[ext] || "application/octet-stream";
}

function isDirtyRecord(record) {
  return record.isNew || record.pathChanged || record.contentChanged;
}

function showPane(name) {
  Object.entries(panes).forEach(([key, node]) => {
    node.classList.toggle("hidden", key !== name);
  });
}

function setDropzoneLoading(isLoading, message = "") {
  dropzone.classList.toggle("dropzone-loading", Boolean(isLoading));
  if (dropzoneTitle) {
    if (isLoading) {
      dropzoneTitle.textContent = message;
    } else {
      dropzoneTitle.innerHTML = t("dropzone_title_html");
    }
  }
  if (dropzoneSubtitle) {
    dropzoneSubtitle.textContent = isLoading ? "" : t("dropzone_subtitle");
  }
  if (createSampleBtn) {
    createSampleBtn.classList.toggle("hidden", Boolean(isLoading));
  }
}

function setPreviewColorControlVisibility(isVisible) {
  if (!previewColorControl) {
    return;
  }
  if (!SHOW_PREVIEW_COLOR_CONTROL) {
    previewColorControl.classList.add("hidden");
    return;
  }
  previewColorControl.classList.toggle("hidden", !isVisible);
}

function revokePreviewUrl(record) {
  if (record.previewUrl) {
    URL.revokeObjectURL(record.previewUrl);
    record.previewUrl = null;
  }
  if (record.treeThumbUrl) {
    URL.revokeObjectURL(record.treeThumbUrl);
    record.treeThumbUrl = null;
    record.treeThumbSource = null;
    record.treeThumbColor = null;
  }
}

function clampSidebarWidth(width) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

function clampSvgPreviewWidth(width) {
  return Math.min(SVG_PREVIEW_MAX_WIDTH, Math.max(SVG_PREVIEW_MIN_WIDTH, width));
}

function setSvgPreviewWidth(width, persist = false) {
  const clamped = clampSvgPreviewWidth(Math.round(width));
  panes.svg.style.setProperty("--svg-preview-width", `${clamped}px`);
  if (persist) {
    localStorage.setItem(SVG_PREVIEW_WIDTH_KEY, String(clamped));
  }
}

function setSidebarWidth(width, persist = false) {
  const clamped = clampSidebarWidth(Math.round(width));
  workspace.style.setProperty("--sidebar-width", `${clamped}px`);
  if (persist) {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped));
  }
}

function restoreSidebarWidth() {
  const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) {
    setSidebarWidth(Math.max(DEFAULT_SIDEBAR_WIDTH, parsed));
    return;
  }
  setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
}

function applySidebarCollapsedState() {
  if (!sidebarPanel || !sidebarTitle) {
    return;
  }
  sidebarPanel.classList.toggle("sidebar-collapsed-mobile", state.sidebarCollapsed);
  sidebarTitle.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
}

function setSidebarCollapsed(collapsed, persist = false) {
  state.sidebarCollapsed = Boolean(collapsed);
  applySidebarCollapsedState();
  if (persist) {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, state.sidebarCollapsed ? "1" : "0");
  }
}

function restoreSidebarCollapsedState() {
  const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  setSidebarCollapsed(raw === "1");
}

function toggleSidebarCollapsed() {
  setSidebarCollapsed(!state.sidebarCollapsed, true);
}

function restoreSvgPreviewWidth() {
  const raw = localStorage.getItem(SVG_PREVIEW_WIDTH_KEY);
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) {
    setSvgPreviewWidth(parsed);
    return;
  }
  setSvgPreviewWidth(DEFAULT_SVG_PREVIEW_WIDTH);
}

function normalizeHexColor(color, fallback = DEFAULT_SVG_PREVIEW_COLOR) {
  const value = String(color || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value.toLowerCase();
  }
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const [, r, g, b] = value;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

function setSvgPreviewColor(color, persist = false) {
  const nextColor = normalizeHexColor(color, state.svgPreviewColor || DEFAULT_SVG_PREVIEW_COLOR);
  const colorChanged = nextColor !== state.svgPreviewColor;
  state.svgPreviewColor = nextColor;
  if (previewColorInput && previewColorInput.value !== state.svgPreviewColor) {
    previewColorInput.value = state.svgPreviewColor;
  }

  if (persist) {
    localStorage.setItem(SVG_PREVIEW_COLOR_KEY, state.svgPreviewColor);
  }

  if (state.activePath) {
    const record = state.files.get(state.activePath);
    if (record?.kind === "svg") {
      updateSvgPreview(record);
    }
  }

  if (colorChanged && state.files.size > 0) {
    renderTree();
  }
}

function restoreSvgPreviewColor() {
  const saved = localStorage.getItem(SVG_PREVIEW_COLOR_KEY);
  if (!saved || saved.toLowerCase() === "#00b0f6") {
    setSvgPreviewColor(DEFAULT_SVG_PREVIEW_COLOR, true);
    return;
  }
  setSvgPreviewColor(saved);
}

function initPanelResizer() {
  if (!panelResizer) {
    return;
  }

  let resizing = false;

  const stopResize = () => {
    if (!resizing) {
      return;
    }
    resizing = false;
    document.body.classList.remove("resizing-panels");

    const current = parseFloat(workspace.style.getPropertyValue("--sidebar-width"));
    if (Number.isFinite(current)) {
      setSidebarWidth(current, true);
    }

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  const onPointerMove = (event) => {
    if (!resizing) {
      return;
    }
    const rect = workspace.getBoundingClientRect();
    const nextWidth = event.clientX - rect.left;
    setSidebarWidth(nextWidth);
  };

  const onPointerUp = () => {
    stopResize();
  };

  panelResizer.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 900px)").matches) {
      return;
    }
    event.preventDefault();
    resizing = true;
    document.body.classList.add("resizing-panels");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });
}

function initSvgPaneResizer() {
  if (!svgPaneResizer) {
    return;
  }

  let resizing = false;

  const stopResize = () => {
    if (!resizing) {
      return;
    }
    resizing = false;
    document.body.classList.remove("resizing-svg-pane");

    const current = parseFloat(panes.svg.style.getPropertyValue("--svg-preview-width"));
    if (Number.isFinite(current)) {
      setSvgPreviewWidth(current, true);
    }

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  const onPointerMove = (event) => {
    if (!resizing) {
      return;
    }
    const rect = panes.svg.getBoundingClientRect();
    const nextWidth = rect.right - event.clientX;
    setSvgPreviewWidth(nextWidth);
  };

  const onPointerUp = () => {
    stopResize();
  };

  svgPaneResizer.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 900px)").matches) {
      return;
    }
    event.preventDefault();
    resizing = true;
    document.body.classList.add("resizing-svg-pane");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });
}

function clearCurrentPreviewUrls() {
  state.files.forEach((record) => {
    revokePreviewUrl(record);
  });
}

function clearState() {
  clearCurrentPreviewUrls();
  state.archiveName = "";
  state.files.clear();
  state.explicitFolders.clear();
  state.activePath = null;
  state.structureChanged = false;
  state.originalFilePaths.clear();
  state.originalFolders.clear();
  state.collapsedFolders.clear();

  archiveName.textContent = t("default_archive_name");
  fileTree.innerHTML = "";
  activeFileName.textContent = t("select_file");
  fileMeta.textContent = "";
  setCodeEditorState(textEditorView, textLanguageCompartment, textLintCompartment, null);
  setCodeEditorState(svgEditorView, svgLanguageCompartment, svgLintCompartment, null);
  imagePreview.removeAttribute("src");
  svgPreview.removeAttribute("src");
  setPreviewColorControlVisibility(false);

  dropzone.classList.remove("hidden");
  workspace.classList.add("hidden");
  downloadBtn.disabled = true;
  downloadBtn.textContent = t("download_archive");
  revertFileBtn.disabled = true;
  showPane("empty");
}

function isProtectedFolderPath(path) {
  return PROTECTED_ROOT_FOLDERS.has(path);
}

function isProtectedFilePath(path) {
  return PROTECTED_FILES.has(path);
}

function hasAnyChanges() {
  return state.structureChanged || Array.from(state.files.values()).some((record) => isDirtyRecord(record));
}

function withModifiedSuffix(name) {
  const matched = name.match(/^(.*?)(\.[^./]+)$/);
  if (!matched) {
    return `${name}-modified`;
  }
  return `${matched[1]}-modified${matched[2]}`;
}

function toggleFolderCollapsed(path) {
  if (state.collapsedFolders.has(path)) {
    state.collapsedFolders.delete(path);
  } else {
    state.collapsedFolders.add(path);
  }
  renderTree();
  schedulePersistState();
}

function isSupportedArchive(file) {
  return /\.(edp|zip)$/i.test(file.name);
}

function isArchivePath(path) {
  return /\.(edp|zip)$/i.test(path);
}

function closeOpenAnotherMenu() {
  if (!openAnotherMenu || !openAnotherBtn) {
    return;
  }
  openAnotherMenu.classList.add("hidden");
  openAnotherBtn.setAttribute("aria-expanded", "false");
}

function toggleOpenAnotherMenu() {
  if (!openAnotherMenu || !openAnotherBtn) {
    return;
  }
  const isHidden = openAnotherMenu.classList.contains("hidden");
  openAnotherMenu.classList.toggle("hidden", !isHidden);
  openAnotherBtn.setAttribute("aria-expanded", String(isHidden));
}

function getFileNameFromContentDisposition(disposition) {
  if (!disposition) {
    return "";
  }
  const utfMatch = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }

  const plainMatch = disposition.match(/filename\s*=\s*"([^"]+)"/i) || disposition.match(/filename\s*=\s*([^;]+)/i);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim();
  }

  return "";
}

function parseGitHubRepoInput(raw) {
  const input = String(raw || "").trim();
  if (!input) {
    return null;
  }

  const shorthand = input.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2].replace(/\.git$/i, "") };
  }

  try {
    const url = new URL(input);
    if (!/github\.com$/i.test(url.hostname)) {
      return null;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
      return null;
    }
    return {
      owner: parts[0],
      repo: parts[1].replace(/\.git$/i, ""),
    };
  } catch {
    return null;
  }
}

async function loadArchiveFromUrl() {
  const input = window.prompt(t("prompt_archive_url"));
  if (input === null) {
    return;
  }

  const url = input.trim();
  if (!url) {
    setStatus(t("error_archive_url_required"), true);
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`.trim());
    }

    const blob = await response.blob();
    const dispositionName = getFileNameFromContentDisposition(response.headers.get("content-disposition"));
    const urlName = (() => {
      try {
        const parsed = new URL(url);
        const candidate = parsed.pathname.split("/").pop() || "";
        return decodeURIComponent(candidate);
      } catch {
        return "";
      }
    })();
    let fileName = dispositionName || urlName || "downloaded-plugin.zip";
    if (!/\.(edp|zip)$/i.test(fileName)) {
      fileName = `${fileName}.zip`;
    }

    const file = new File([blob], fileName, {
      type: blob.type || "application/zip",
    });

    await loadArchive(file);
  } catch (error) {
    setStatus(t("error_download_url", { message: error.message || "Unknown error" }), true);
  }
}

async function loadGithubRepositoryFiles() {
  const rawRepo = window.prompt(t("prompt_github_repo"));
  if (rawRepo === null) {
    return;
  }

  const repo = parseGitHubRepoInput(rawRepo);
  if (!repo) {
    setStatus(rawRepo.trim() ? t("error_github_repo_format") : t("error_github_repo_required"), true);
    return;
  }

  const rawBranch = window.prompt(t("prompt_github_branch"), "main");
  if (rawBranch === null) {
    return;
  }
  const branch = rawBranch.trim() || "main";

  clearState();
  setDropzoneLoading(true, t("loading_github"));

  try {
    const treeUrl = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const treeResponse = await fetch(treeUrl);
    if (!treeResponse.ok) {
      throw new Error(`${treeResponse.status} ${treeResponse.statusText}`.trim());
    }

    const treePayload = await treeResponse.json();
    const treeItems = Array.isArray(treePayload?.tree) ? treePayload.tree : [];
    const fileItems = treeItems.filter((item) => item?.type === "blob" && normalizePath(item.path || ""));

    treeItems
      .filter((item) => item?.type === "tree")
      .forEach((item) => {
        const folderPath = normalizeFolderPath(item.path || "");
        if (folderPath) {
          state.explicitFolders.add(folderPath);
        }
      });

    for (const item of fileItems) {
      const path = normalizePath(item.path);
      const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/${encodeURIComponent(
        branch,
      )}/${path}`;
      const fileResponse = await fetch(rawUrl);
      if (!fileResponse.ok) {
        throw new Error(`${path}: ${fileResponse.status} ${fileResponse.statusText}`.trim());
      }
      const bytes = new Uint8Array(await fileResponse.arrayBuffer());
      const record = createRecordFromBytes(path, bytes, fileResponse.headers.get("content-type") || "");
      state.files.set(path, record);
    }

    state.archiveName = `${repo.repo}-${branch}.zip`;
    state.originalFilePaths = new Set(state.files.keys());
    state.originalFolders = getAllFolderPaths();
    recomputeStructureChanged();

    archiveName.textContent = state.archiveName;
    dropzone.classList.add("hidden");
    workspace.classList.remove("hidden");

    renderTree();
    updateDownloadButtonState();
    schedulePersistState();

    if (state.files.size > 0) {
      selectFile(chooseFallbackPath());
    } else {
      showPane("empty");
      activeFileName.textContent = t("archive_has_no_files");
      fileMeta.textContent = "";
      updateRevertButtonState();
    }
  } catch (error) {
    clearState();
    setStatus(t("error_open_github_repo", { message: error.message || "Unknown error" }), true);
  } finally {
    setDropzoneLoading(false);
  }
}

function getAllFolderPaths() {
  const folders = new Set(state.explicitFolders);

  state.files.forEach((record) => {
    const parts = record.path.split("/");
    let current = "";

    for (let index = 0; index < parts.length - 1; index += 1) {
      current = current ? `${current}/${parts[index]}` : parts[index];
      folders.add(current);
    }
  });

  return folders;
}

function setsEqual(first, second) {
  if (first.size !== second.size) {
    return false;
  }

  for (const value of first) {
    if (!second.has(value)) {
      return false;
    }
  }

  return true;
}

function recomputeStructureChanged() {
  const currentFilePaths = new Set(state.files.keys());
  const currentFolders = getAllFolderPaths();

  state.structureChanged = !setsEqual(currentFilePaths, state.originalFilePaths) || !setsEqual(currentFolders, state.originalFolders);
}

function updateRecordFlags(record) {
  record.contentChanged = (record.kind === "text" || record.kind === "svg") && record.currentText !== record.originalText;
  record.pathChanged = Boolean(record.initialPath && record.path !== record.initialPath);
}

function doesFolderExist(path) {
  return getAllFolderPaths().has(path);
}

function doesFileExist(path) {
  return state.files.has(path);
}

function ensureUniquePath(path) {
  if (!doesFileExist(path) && !doesFolderExist(path)) {
    return path;
  }

  const parent = getParentPath(path);
  const name = path.split("/").pop() || "file";
  const dotIndex = name.lastIndexOf(".");
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const ext = dotIndex > 0 ? name.slice(dotIndex) : "";

  let index = 1;
  while (true) {
    const candidate = joinPath(parent, `${base}-${index}${ext}`);
    if (!doesFileExist(candidate) && !doesFolderExist(candidate)) {
      return candidate;
    }
    index += 1;
  }
}

function makeActionButton(icon, title, onClick, tone = "default") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn";
  if (tone !== "default") {
    button.classList.add(`icon-btn-${tone}`);
  }
  button.title = title;
  button.setAttribute("aria-label", title);
  button.innerHTML = ICONS[icon] || "";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

function makeTextActionButton(label, title, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tree-text-btn";
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

function getRecordMeta(record) {
  return isDirtyRecord(record) ? t("meta_modified_short") : "";
}

function renderTree() {
  fileTree.innerHTML = "";

  const root = {
    path: "",
    folders: new Map(),
    files: [],
  };

  function ensureFolderInTree(path) {
    if (!path) {
      return;
    }

    const parts = path.split("/");
    let node = root;
    let currentPath = "";

    parts.forEach((part) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!node.folders.has(part)) {
        node.folders.set(part, {
          name: part,
          path: currentPath,
          folders: new Map(),
          files: [],
        });
      }
      node = node.folders.get(part);
    });
  }

  getAllFolderPaths().forEach((folderPath) => {
    ensureFolderInTree(folderPath);
  });

  state.files.forEach((record) => {
    const parent = getParentPath(record.path);
    ensureFolderInTree(parent);

    const parts = record.path.split("/");
    let node = root;

    for (let index = 0; index < parts.length - 1; index += 1) {
      node = node.folders.get(parts[index]);
    }

    node.files.push({
      name: parts[parts.length - 1],
      path: record.path,
    });
  });

  function renderFolder(node, depth) {
    const folders = Array.from(node.folders.values()).sort((a, b) => a.name.localeCompare(b.name));
    const files = node.files.sort((a, b) => a.name.localeCompare(b.name));

    folders.forEach((folder) => {
      const isLockedRoot = isProtectedFolderPath(folder.path);
      const isCollapsed = state.collapsedFolders.has(folder.path);
      const row = document.createElement("div");
      row.className = "tree-node";
      row.dataset.kind = "folder";
      row.dataset.path = folder.path;

      const label = document.createElement("button");
      label.type = "button";
      label.className = "tree-label tree-label-folder";
      label.style.paddingLeft = `${10 + depth * 14}px`;
      label.addEventListener("click", () => toggleFolderCollapsed(folder.path));

      const chevron = document.createElement("span");
      chevron.className = "folder-chevron";
      chevron.innerHTML = isCollapsed ? ICONS.chevronRight : ICONS.chevronDown;

      const folderName = document.createElement("span");
      folderName.className = "tree-label-name";
      folderName.textContent = `${folder.name}/`;

      label.append(chevron, folderName);

      const actions = document.createElement("div");
      actions.className = "tree-actions";
      if (!isLockedRoot) {
        actions.append(makeActionButton("plus", t("action_create_item"), () => handleCreateItem(folder.path)));
      }
      if (folder.path === "icons") {
        actions.append(makeTextActionButton(t("action_find_pinhead"), t("action_pinhead"), () => openPinheadForIcons(folder.path)));
        actions.append(
          makeTextActionButton(t("action_upload_from_disk"), t("action_upload_from_disk"), () => openFolderUploadDialog(folder.path)),
        );
      }
      if (!isLockedRoot) {
        actions.append(makeActionButton("pencil", t("action_rename_folder"), () => renameFolder(folder.path)));
        actions.append(makeActionButton("trash", t("action_delete_folder"), () => deleteFolder(folder.path)));
      }

      row.append(label, actions);
      fileTree.appendChild(row);

      if (!isCollapsed) {
        renderFolder(folder, depth + 1);
      }
    });

    files.forEach((file) => {
      const row = document.createElement("div");
      row.className = "tree-node";
      row.dataset.kind = "file";
      row.dataset.path = file.path;

      const label = document.createElement("button");
      label.type = "button";
      label.className = "tree-label tree-label-file";
      label.style.paddingLeft = `${10 + depth * 14}px`;

      const fileRecord = state.files.get(file.path);
      if (state.activePath === file.path) {
        row.classList.add("active-file-row");
      }
      if (fileRecord && isDirtyRecord(fileRecord)) {
        label.classList.add("changed");
      }

      if (fileRecord && (fileRecord.kind === "image" || fileRecord.kind === "svg")) {
        const thumb = document.createElement("img");
        thumb.className = "file-kind-thumb";
        thumb.alt = "";
        thumb.src = getTreeThumbnailUrl(fileRecord);
        label.appendChild(thumb);
      }

      const fileName = document.createElement("span");
      fileName.className = "tree-label-name";
      fileName.textContent = file.name;
      label.appendChild(fileName);

      label.addEventListener("click", () => selectFile(file.path));

      const actions = document.createElement("div");
      actions.className = "tree-actions";
      actions.append(makeActionButton("pencil", t("action_rename_file"), () => renameFile(file.path)));
      if (!isProtectedFilePath(file.path)) {
        actions.append(makeActionButton("trash", t("action_delete_file"), () => deleteFile(file.path)));
      }

      row.append(label, actions);
      fileTree.appendChild(row);
    });
  }

  renderFolder(root, 0);
}

function updateDownloadButtonState() {
  const hasArchiveLoaded = Boolean(state.archiveName) || state.files.size > 0 || state.explicitFolders.size > 0;
  downloadBtn.disabled = !hasArchiveLoaded;
  downloadBtn.textContent = hasAnyChanges() ? t("download_modified_archive") : t("download_archive");
}

function updateRevertButtonState() {
  if (!state.activePath) {
    revertFileBtn.disabled = true;
    return;
  }

  const record = state.files.get(state.activePath);
  if (!record) {
    revertFileBtn.disabled = true;
    return;
  }

  const hasRevertable = record.isNew || record.pathChanged || record.contentChanged;
  revertFileBtn.disabled = !hasRevertable;
}

const codeHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.modifier],
    color: "#ffbe76",
    fontWeight: "600",
  },
  { tag: [tags.string, tags.regexp, tags.escape], color: "#91f2b3" },
  { tag: [tags.number, tags.bool, tags.null], color: "#f6d089" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "#6f8ca0", fontStyle: "italic" },
  { tag: [tags.atom, tags.constant(tags.name)], color: "#ff9b8f" },
  { tag: [tags.typeName, tags.className, tags.propertyName, tags.attributeName], color: "#a8d8ff" },
  { tag: [tags.variableName, tags.name], color: "#dce8ef" },
  { tag: [tags.punctuation, tags.bracket, tags.separator], color: "#9fb4c2" },
  { tag: [tags.operator], color: "#b4c8d6" },
]);

const codeEditorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "#c8d8e3",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", Menlo, monospace',
      lineHeight: "1.45",
    },
    ".cm-content": {
      padding: "12px",
      minHeight: "100%",
      fontSize: "0.92rem",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      border: "none",
      color: "#6f8ca0",
    },
    ".cm-cursor": {
      borderLeftColor: "#e6f4ff",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.03)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
    },
    "&.cm-focused": {
      outline: "none",
    },
    "&.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(0, 176, 246, 0.25)",
    },
  },
  { dark: true },
);

function getCodeLanguageExtension(record) {
  if (record.kind === "svg") {
    return xmlLanguage();
  }

  const ext = getExtension(record.path);
  if (ext === "yaml" || ext === "yml") {
    return yamlLanguage();
  }

  return [];
}

function isYamlPath(path) {
  const ext = getExtension(path);
  return ext === "yaml" || ext === "yml";
}

function isPluginManifestPath(path) {
  const normalized = normalizePath(path).toLowerCase();
  return normalized === "plugin.yaml" || normalized.endsWith("/plugin.yaml");
}

function clampDiagnosticRange(from, to, length) {
  const safeFrom = Math.max(0, Math.min(length, Number.isFinite(from) ? from : 0));
  const safeTo = Math.max(safeFrom + 1, Math.min(length, Number.isFinite(to) ? to : safeFrom + 1));
  return { from: safeFrom, to: safeTo };
}

function nodeToRange(node, length) {
  const range = Array.isArray(node?.range) ? node.range : null;
  if (!range || range.length === 0) {
    return clampDiagnosticRange(0, 1, length);
  }
  if (range.length === 1) {
    return clampDiagnosticRange(range[0], range[0] + 1, length);
  }
  return clampDiagnosticRange(range[0], range[1], length);
}

function yamlIssueToRange(issue, length) {
  if (Array.isArray(issue?.pos) && issue.pos.length >= 2) {
    return clampDiagnosticRange(issue.pos[0], issue.pos[1], length);
  }
  if (Array.isArray(issue?.pos) && issue.pos.length === 1) {
    return clampDiagnosticRange(issue.pos[0], issue.pos[0] + 1, length);
  }
  return clampDiagnosticRange(0, 1, length);
}

function getScalarString(node) {
  if (!node) {
    return "";
  }
  if (typeof node.value === "string") {
    return node.value;
  }
  if (typeof node?.toJSON === "function") {
    const json = node.toJSON();
    return typeof json === "string" ? json : String(json ?? "");
  }
  return String(node.value ?? "");
}

function buildYamlDiagnostics(source, path) {
  const diagnostics = [];
  const length = source.length;
  const manifestPath = isPluginManifestPath(path);

  let doc;
  try {
    doc = parseDocument(source, {
      prettyErrors: false,
      strict: false,
      uniqueKeys: false,
    });
  } catch (error) {
    const range = clampDiagnosticRange(0, 1, length);
    diagnostics.push({
      ...range,
      severity: "error",
      message: t("yaml_lint_parse_error", { message: error?.message || "Invalid YAML" }),
    });
    return diagnostics;
  }

  doc.errors.forEach((issue) => {
    const range = yamlIssueToRange(issue, length);
    const message = String(issue.message || "Invalid YAML").split("\n")[0];
    diagnostics.push({
      ...range,
      severity: "error",
      message: t("yaml_lint_parse_error", { message }),
    });
  });

  doc.warnings.forEach((issue) => {
    const range = yamlIssueToRange(issue, length);
    const message = String(issue.message || "YAML warning").split("\n")[0];
    diagnostics.push({
      ...range,
      severity: "warning",
      message: t("yaml_lint_parse_error", { message }),
    });
  });

  if (!manifestPath || doc.errors.length > 0 || !isMap(doc.contents)) {
    return diagnostics;
  }

  let hasId = false;

  doc.contents.items.forEach((item) => {
    const key = getScalarString(item.key);
    if (!key) {
      return;
    }

    if (!PLUGIN_TOP_LEVEL_KEYS.has(key)) {
      diagnostics.push({
        ...nodeToRange(item.key, length),
        severity: "warning",
        message: t("yaml_lint_unknown_key", { key }),
      });
    }

    if (key === "id") {
      hasId = true;
      const idValue = getScalarString(item.value).trim();
      if (!PLUGIN_ID_PATTERN.test(idValue)) {
        diagnostics.push({
          ...nodeToRange(item.value || item.key, length),
          severity: "error",
          message: t("yaml_lint_invalid_id"),
        });
      }
    }

    if (key === "version") {
      const rawValue = getScalarString(item.value).trim();
      const isNumeric = rawValue !== "" && !Number.isNaN(Number(rawValue));
      if (!isNumeric) {
        diagnostics.push({
          ...nodeToRange(item.value || item.key, length),
          severity: "warning",
          message: t("yaml_lint_version_number"),
        });
      }
    }
  });

  if (!hasId) {
    diagnostics.push({
      ...clampDiagnosticRange(0, 1, length),
      severity: "error",
      message: t("yaml_lint_missing_id"),
    });
  }

  return diagnostics;
}

function getLintExtension(record) {
  if (!record || !isYamlPath(record.path)) {
    return [];
  }

  const path = record.path;
  return [
    linter((view) => buildYamlDiagnostics(view.state.doc.toString(), path), {
      delay: 180,
    }),
  ];
}

function withSuppressedEditorUpdate(callback) {
  suppressEditorUpdate = true;
  try {
    callback();
  } finally {
    suppressEditorUpdate = false;
  }
}

function handleCodeEditorUpdate(kind, update) {
  if (!update.docChanged || suppressEditorUpdate) {
    return;
  }

  const path = state.activePath;
  if (!path) {
    return;
  }

  const record = state.files.get(path);
  if (!record || record.kind !== kind) {
    return;
  }

  record.currentText = update.state.doc.toString();
  updateRecordFlags(record);

  if (record.kind === "svg") {
    updateSvgPreview(record);
  }

  fileMeta.textContent = getRecordMeta(record);
  updateFileEditingState();
}

function createCodeEditorExtensions(kind, languageCompartment, lintCompartment) {
  return [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    syntaxHighlighting(codeHighlightStyle, { fallback: true }),
    codeEditorTheme,
    languageCompartment.of([]),
    lintCompartment.of([]),
    EditorView.updateListener.of((update) => handleCodeEditorUpdate(kind, update)),
  ];
}

function initializeCodeEditors() {
  if (textEditor && !textEditorView) {
    textEditorView = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: createCodeEditorExtensions("text", textLanguageCompartment, textLintCompartment),
      }),
      parent: textEditor,
    });
  }

  if (svgEditor && !svgEditorView) {
    svgEditorView = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: createCodeEditorExtensions("svg", svgLanguageCompartment, svgLintCompartment),
      }),
      parent: svgEditor,
    });
  }
}

function setCodeEditorState(view, languageCompartment, lintCompartment, record) {
  if (!view) {
    return;
  }

  const nextText = record?.currentText || "";

  withSuppressedEditorUpdate(() => {
    view.dispatch({
      effects: [
        languageCompartment.reconfigure(record ? getCodeLanguageExtension(record) : []),
        lintCompartment.reconfigure(record ? getLintExtension(record) : []),
      ],
    });

    const currentText = view.state.doc.toString();
    if (currentText === nextText) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: nextText,
      },
    });
  });
}

function upsertSvgStyleColor(attributes, color) {
  const styleRegex = /\bstyle\s*=\s*(["'])(.*?)\1/i;
  if (!styleRegex.test(attributes)) {
    return `${attributes} style="color: ${color};"`;
  }

  return attributes.replace(styleRegex, (match, quote, styleValue) => {
    const declarations = styleValue
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !item.toLowerCase().startsWith("color:"));
    declarations.push(`color: ${color}`);
    return `style=${quote}${declarations.join("; ")};${quote}`;
  });
}

function buildSvgPreviewMarkup(source, color) {
  const text = String(source || "");
  if (!/<svg\b[^>]*>/i.test(text)) {
    return text;
  }

  const hasCurrentColor = /currentColor/i.test(text);
  const hasStrokeUsage = /\bstroke\s*=/i.test(text);
  const safeColor = normalizeHexColor(color, DEFAULT_SVG_PREVIEW_COLOR);

  return text.replace(/<svg\b([^>]*)>/i, (match, attrs) => {
    let nextAttrs = upsertSvgStyleColor(attrs, safeColor);

    if (!hasCurrentColor) {
      if (!/\bfill\s*=/i.test(nextAttrs)) {
        nextAttrs = `${nextAttrs} fill="currentColor"`;
      }
      if (hasStrokeUsage && !/\bstroke\s*=/i.test(nextAttrs)) {
        nextAttrs = `${nextAttrs} stroke="currentColor"`;
      }
    }

    return `<svg${nextAttrs}>`;
  });
}

function applyPreviewScale(imageElement) {
  if (!imageElement.naturalWidth || !imageElement.naturalHeight) {
    return;
  }

  const baseWidth = imageElement.naturalWidth * PREVIEW_SCALE_FACTOR;
  const baseHeight = imageElement.naturalHeight * PREVIEW_SCALE_FACTOR;
  const scale = Math.min(1, PREVIEW_MAX_WIDTH / baseWidth, PREVIEW_MAX_HEIGHT / baseHeight);

  imageElement.style.width = `${Math.round(baseWidth * scale)}px`;
  imageElement.style.height = `${Math.round(baseHeight * scale)}px`;
}

function updateImagePreview(record, target) {
  revokePreviewUrl(record);
  const blob = new Blob([record.originalBytes], { type: record.mime || getMimeType(record.path) });
  record.previewUrl = URL.createObjectURL(blob);
  target.src = record.previewUrl;
}

function updateSvgPreview(record) {
  revokePreviewUrl(record);
  const previewMarkup = buildSvgPreviewMarkup(record.currentText, state.svgPreviewColor);
  const blob = new Blob([previewMarkup], { type: "image/svg+xml" });
  record.previewUrl = URL.createObjectURL(blob);
  svgPreview.src = record.previewUrl;
}

function getTreeThumbnailUrl(record) {
  if (record.kind === "image") {
    if (!record.treeThumbUrl) {
      const blob = new Blob([record.originalBytes], { type: record.mime || getMimeType(record.path) });
      record.treeThumbUrl = URL.createObjectURL(blob);
    }
    return record.treeThumbUrl;
  }

  if (record.kind === "svg") {
    if (
      record.treeThumbSource !== record.currentText ||
      record.treeThumbColor !== state.svgPreviewColor ||
      !record.treeThumbUrl
    ) {
      if (record.treeThumbUrl) {
        URL.revokeObjectURL(record.treeThumbUrl);
      }
      const thumbMarkup = buildSvgPreviewMarkup(record.currentText, state.svgPreviewColor);
      const blob = new Blob([thumbMarkup], { type: "image/svg+xml" });
      record.treeThumbUrl = URL.createObjectURL(blob);
      record.treeThumbSource = record.currentText;
      record.treeThumbColor = state.svgPreviewColor;
    }
    return record.treeThumbUrl;
  }

  return "";
}

function selectFile(path) {
  const record = state.files.get(path);
  if (!record) {
    return;
  }

  state.activePath = path;
  renderTree();

  activeFileName.textContent = record.path;
  fileMeta.textContent = getRecordMeta(record);

  if (record.kind === "text") {
    setPreviewColorControlVisibility(false);
    setCodeEditorState(textEditorView, textLanguageCompartment, textLintCompartment, record);
    showPane("text");
    updateRevertButtonState();
    return;
  }

  if (record.kind === "image") {
    setPreviewColorControlVisibility(false);
    updateImagePreview(record, imagePreview);
    showPane("image");
    updateRevertButtonState();
    return;
  }

  if (record.kind === "svg") {
    setPreviewColorControlVisibility(true);
    setCodeEditorState(svgEditorView, svgLanguageCompartment, svgLintCompartment, record);
    updateSvgPreview(record);
    showPane("svg");
    updateRevertButtonState();
    return;
  }

  setPreviewColorControlVisibility(false);
  showPane("binary");
  updateRevertButtonState();
}

function createEmptyRecord(path) {
  const kind = detectKind(path) === "svg" ? "svg" : "text";

  return {
    path,
    initialPath: null,
    kind,
    mime: getMimeType(path),
    originalBytes: new Uint8Array(),
    originalText: "",
    currentText: "",
    contentChanged: false,
    pathChanged: false,
    isNew: true,
    previewUrl: null,
    treeThumbUrl: null,
    treeThumbSource: null,
    treeThumbColor: null,
  };
}

function createNewIconInIconsFolder(folderPath) {
  const targetPath = ensureUniquePath(joinPath(folderPath, "new-icon.svg"));
  const template =
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="currentColor">\n  <circle cx="24" cy="24" r="14"/>\n</svg>\n';
  const record = createEmptyRecord(targetPath);
  record.kind = "svg";
  record.mime = "image/svg+xml";
  record.currentText = template;
  record.originalText = template;
  record.originalBytes = new Uint8Array();
  updateRecordFlags(record);

  createFile(targetPath, record);
  window.open("https://pinhead.ink/", "_blank", "noopener,noreferrer");
}

function openPinheadForIcons(folderPath) {
  createNewIconInIconsFolder(folderPath);
}

function openFolderUploadDialog(folderPath) {
  iconsUploadInput.dataset.targetFolder = folderPath;
  iconsUploadInput.value = "";
  iconsUploadInput.click();
}

function createRecordFromBytes(path, bytes, mime = "", isNew = false) {
  const kind = detectKind(path);
  const record = {
    path,
    initialPath: isNew ? null : path,
    kind,
    mime: mime || getMimeType(path),
    originalBytes: bytes,
    originalText: "",
    currentText: "",
    contentChanged: false,
    pathChanged: false,
    isNew,
    previewUrl: null,
    treeThumbUrl: null,
    treeThumbSource: null,
    treeThumbColor: null,
  };

  if (kind === "text" || kind === "svg") {
    const text = textDecoder.decode(bytes);
    record.originalText = text;
    record.currentText = text;
  }

  updateRecordFlags(record);
  return record;
}

function updateFileEditingState() {
  updateDownloadButtonState();
  updateRevertButtonState();
  renderTree();
  schedulePersistState();
}

function createSamplePlugin() {
  clearState();

  const pluginYaml = `id: example_plugin_rename_me
name: "Example Plugin (rename me!)"
version: 1.0
description: |
  Demo plugin created in EveryDoor Plugin Editor.

  Contains sample imagery and icon resources.
author: "deevroman"
icon: "billboard.svg"
experimental: true 
homepage: "https://github.com/deevroman/every-door-plugin-web-editor"
intro: |
  # Example plugin

  Installed from the [editor](https://github.com/deevroman/every-door-plugin-web-editor) starter template.

presets:
  water_vending:
    terms: [water, вод]
    icon: droplet.svg
    tags:
      amenity: vending_machine
      vending: water
    addTags:
      amenity: vending_machine
      vending: water
    fields:
      - '@amenity/vending_machine'

imagery:
  osm_overzoom:
    name: "osm_zoom"
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    maxZoom: 123
    attribution: "OpenStreetMap contributors"

overlays:
  - url: "https://gps.tile.openstreetmap.org/lines/{z}/{x}/{y}.png"
    name: "osm_gps"
    maxZoom: 19
    attribution: "OpenStreetMap contributors"
    type: raster
  - url: "https://tile.waymarkedtrails.org/cycling/{zoom}/{x}/{y}.png"  
    maxZoom: 17  
    attribution: "WaymarkedTrails.org"

modes:
  # define new mode button
  advertising:                
    type: entrances
    icon: billboard.svg
    name: Advertising
    kinds: [billboard, street_lamp]
    markers:
      billboard:
        requiredKeys: [advertising]
      street_lamp:
        requiredKeys: [highway, lamp_type]
        label: "{lamp_type}"
    primary:
      icon: billboard.svg
      tooltip: Billboard
      adjustZoom: 0.7
      preset: advertising/billboard
    secondary:
      icon: street_lamp.svg
      tooltip: Street lamp
      adjustZoom: 0.7
      preset: highway/street_lamp
  # define news icons on map in micromapping mode
  micro:
    kinds:
      billboard:
        matcher:
          advertising:
            only: [ billboard ]
      street_lamp:
        matcher:
          highway:
            only: [ street_lamp ]
    defaultPresets:
      - advertising/billboard
      - highway/street_lamp
    markers:
      advertising/billboard:
        icon: billboard.svg
      highway/street_lamp:
        icon: street_lamp.svg

kinds:
  # ¯\\_(ツ)_/¯ 
  advertising:
    type: entrances
    icon: billboard.svg
    name: Advertising & Lamp
    kinds: [billboard, street_lamp]
    markers:
      billboard:
        requiredKeys: [advertising]
      street_lamp:
        requiredKeys: [highway, lamp_type]
        label: "{lamp_type}"
    primary:
      icon: billboard.svg
      tooltip: Billboard
      adjustZoom: 0.7
      preset: advertising/billboard
    secondary:
      icon: street_lamp.svg
      tooltip: Street lamp
      adjustZoom: 0.7
      preset: highway/street_lamp
  billboard:
    matcher:
      advertising:
        only: [billboard]
  street_lamp:
    matcher:
      highway:
        only: [street_lamp]
  micro:
    kinds:
      billboard:
        matcher:
          advertising:
            only: [ billboard ]
      street_lamp:
        matcher:
          highway:
            only: [ street_lamp ]
    defaultPresets:
      - advertising/billboard
      - highway/street_lamp
    markers:
      advertising/billboard:
        icon: billboard.svg

`;
  const englishYaml = `name: "Example Plugin"
description: "Demo plugin created in Web plugin editor."
presets:
  water_vending:
    name: "Water vending machine"
`;
  const russianYaml = `name: "Пример плагина"
description: "Демо-плагин, созданный в веб-редакторе плагинов."
presets:
  water_vending:
    name: "Автомат по продаже воды"
`;

  state.archiveName = t("sample_archive_name");
  state.explicitFolders.add("icons");
  state.explicitFolders.add("langs");

  const pluginRecord = createRecordFromBytes("plugin.yaml", textEncoder.encode(pluginYaml), "text/yaml");
  const langRecord = createRecordFromBytes("langs/en.yaml", textEncoder.encode(englishYaml), "text/yaml");
  const ruLangRecord = createRecordFromBytes("langs/ru.yaml", textEncoder.encode(russianYaml), "text/yaml");
  const billboardRecord = createRecordFromBytes("icons/billboard.svg", textEncoder.encode(PINHEAD_BILLBOARD_SVG), "image/svg+xml");
  const streetLampRecord = createRecordFromBytes(
    "icons/street_lamp.svg",
    textEncoder.encode(PINHEAD_STREET_LAMP_SVG),
    "image/svg+xml",
  );
  const dropletRecord = createRecordFromBytes("icons/droplet.svg", textEncoder.encode(PINHEAD_DROPLET_SVG), "image/svg+xml");
  state.files.set(pluginRecord.path, pluginRecord);
  state.files.set(langRecord.path, langRecord);
  state.files.set(ruLangRecord.path, ruLangRecord);
  state.files.set(billboardRecord.path, billboardRecord);
  state.files.set(streetLampRecord.path, streetLampRecord);
  state.files.set(dropletRecord.path, dropletRecord);

  state.originalFilePaths = new Set(state.files.keys());
  state.originalFolders = getAllFolderPaths();
  recomputeStructureChanged();

  archiveName.textContent = state.archiveName;
  dropzone.classList.add("hidden");
  workspace.classList.remove("hidden");
  renderTree();
  updateDownloadButtonState();
  schedulePersistState();
  selectFile("plugin.yaml");
}

function createFolder(path) {
  const normalized = normalizeFolderPath(path);
  if (!normalized) {
    setStatus(t("error_folder_name_empty"), true);
    return;
  }

  if (doesFileExist(normalized)) {
    setStatus(t("error_file_exists"), true);
    return;
  }

  if (doesFolderExist(normalized)) {
    setStatus(t("error_folder_exists"), true);
    return;
  }

  state.explicitFolders.add(normalized);
  recomputeStructureChanged();
  updateFileEditingState();
}

function createFile(path, recordOverride = null) {
  const normalized = normalizePath(path);
  if (!normalized) {
    setStatus(t("error_file_name_empty"), true);
    return null;
  }

  if (doesFileExist(normalized) || doesFolderExist(normalized)) {
    setStatus(t("error_file_or_folder_exists"), true);
    return null;
  }

  const record = recordOverride || createEmptyRecord(normalized);
  record.path = normalized;
  record.mime = getMimeType(normalized);
  record.kind = detectKind(normalized);
  record.isNew = record.initialPath === null;
  updateRecordFlags(record);

  state.files.set(normalized, record);
  recomputeStructureChanged();
  updateFileEditingState();
  selectFile(normalized);
  return normalized;
}

function handleCreateItem(parentPath = "") {
  const input = window.prompt(t("prompt_new_item"));
  if (input === null) {
    return;
  }

  const raw = input.trim();
  if (!raw) {
    setStatus(t("error_name_empty"), true);
    return;
  }

  const asFolder = raw.endsWith("/");
  const normalizedTail = asFolder ? normalizeFolderPath(raw) : normalizePath(raw);
  const fullPath = joinPath(parentPath, normalizedTail);

  if (!fullPath) {
    setStatus(t("error_name_empty"), true);
    return;
  }

  if (asFolder) {
    createFolder(fullPath);
  } else {
    createFile(fullPath);
  }
}

function renameFile(path) {
  if (isProtectedFilePath(path)) {
    setStatus(t("error_protected_file_rename"), true);
    return;
  }

  const record = state.files.get(path);
  if (!record) {
    return;
  }

  const currentName = path.split("/").pop() || "";
  const nextName = window.prompt(t("prompt_new_file_name"), currentName);
  if (nextName === null) {
    return;
  }

  const cleanName = nextName.trim();
  if (!cleanName || cleanName.includes("/")) {
    setStatus(t("error_simple_file_name"), true);
    return;
  }

  const parent = getParentPath(path);
  const nextPath = joinPath(parent, cleanName);

  if (nextPath === path) {
    return;
  }

  if (doesFileExist(nextPath) || doesFolderExist(nextPath)) {
    setStatus(t("error_file_or_folder_exists"), true);
    return;
  }

  state.files.delete(path);
  record.path = nextPath;
  record.mime = getMimeType(nextPath);
  record.kind = detectKind(nextPath);
  updateRecordFlags(record);
  state.files.set(nextPath, record);

  if (state.activePath === path) {
    state.activePath = nextPath;
  }

  recomputeStructureChanged();
  updateFileEditingState();

  if (state.activePath) {
    selectFile(state.activePath);
  }
}

function renameFolder(path) {
  const currentName = path.split("/").pop() || "";
  const nextName = window.prompt(t("prompt_new_folder_name"), currentName);
  if (nextName === null) {
    return;
  }

  const cleanName = normalizeFolderPath(nextName);
  if (!cleanName || cleanName.includes("/")) {
    setStatus(t("error_simple_folder_name"), true);
    return;
  }

  const parent = getParentPath(path);
  const nextPrefix = joinPath(parent, cleanName);

  if (nextPrefix === path) {
    return;
  }

  const allFolders = getAllFolderPaths();
  if (allFolders.has(nextPrefix) || doesFileExist(nextPrefix)) {
    setStatus(t("error_file_or_folder_exists"), true);
    return;
  }

  const fileUpdates = [];
  state.files.forEach((record, filePath) => {
    if (filePath === path || filePath.startsWith(`${path}/`)) {
      const nextPath = `${nextPrefix}${filePath.slice(path.length)}`;
      fileUpdates.push({ filePath, nextPath, record });
    }
  });

  fileUpdates.forEach(({ filePath }) => {
    state.files.delete(filePath);
  });

  fileUpdates.forEach(({ nextPath, record }) => {
    record.path = nextPath;
    record.mime = getMimeType(nextPath);
    record.kind = detectKind(nextPath);
    updateRecordFlags(record);
    state.files.set(nextPath, record);
  });

  const nextExplicitFolders = new Set();
  state.explicitFolders.forEach((folderPath) => {
    if (folderPath === path || folderPath.startsWith(`${path}/`)) {
      nextExplicitFolders.add(`${nextPrefix}${folderPath.slice(path.length)}`);
    } else {
      nextExplicitFolders.add(folderPath);
    }
  });
  state.explicitFolders = nextExplicitFolders;

  const nextCollapsedFolders = new Set();
  state.collapsedFolders.forEach((folderPath) => {
    if (folderPath === path || folderPath.startsWith(`${path}/`)) {
      nextCollapsedFolders.add(`${nextPrefix}${folderPath.slice(path.length)}`);
    } else {
      nextCollapsedFolders.add(folderPath);
    }
  });
  state.collapsedFolders = nextCollapsedFolders;

  if (state.activePath && (state.activePath === path || state.activePath.startsWith(`${path}/`))) {
    state.activePath = `${nextPrefix}${state.activePath.slice(path.length)}`;
  }

  recomputeStructureChanged();
  updateFileEditingState();

  if (state.activePath) {
    selectFile(state.activePath);
  }
}

function deleteFile(path) {
  if (isProtectedFilePath(path)) {
    setStatus(t("error_protected_file"), true);
    return;
  }

  const record = state.files.get(path);
  if (!record) {
    return;
  }

  const confirmed = window.confirm(t("confirm_delete_file", { path }));
  if (!confirmed) {
    return;
  }

  revokePreviewUrl(record);
  state.files.delete(path);

  if (state.activePath === path) {
    state.activePath = chooseFallbackPath();
  }

  recomputeStructureChanged();
  updateFileEditingState();

  if (state.activePath) {
    selectFile(state.activePath);
  } else {
    activeFileName.textContent = t("select_file");
    fileMeta.textContent = "";
    showPane("empty");
    updateRevertButtonState();
  }
}

function deleteFolder(path) {
  if (isProtectedFolderPath(path)) {
    setStatus(t("error_protected_folder"), true);
    return;
  }

  const filesToDelete = Array.from(state.files.keys()).filter((filePath) => filePath === path || filePath.startsWith(`${path}/`));
  const protectedHit = filesToDelete.find((filePath) => isProtectedFilePath(filePath));
  if (protectedHit) {
    setStatus(t("error_cannot_delete_protected_in_folder", { path: protectedHit }), true);
    return;
  }

  const confirmed = window.confirm(t("confirm_delete_folder", { path }));
  if (!confirmed) {
    return;
  }

  filesToDelete.forEach((filePath) => {
    const record = state.files.get(filePath);
    if (record) {
      revokePreviewUrl(record);
    }
    state.files.delete(filePath);
  });

  const nextExplicitFolders = new Set();
  state.explicitFolders.forEach((folderPath) => {
    if (folderPath !== path && !folderPath.startsWith(`${path}/`)) {
      nextExplicitFolders.add(folderPath);
    }
  });
  state.explicitFolders = nextExplicitFolders;

  const nextCollapsedFolders = new Set();
  state.collapsedFolders.forEach((folderPath) => {
    if (folderPath !== path && !folderPath.startsWith(`${path}/`)) {
      nextCollapsedFolders.add(folderPath);
    }
  });
  state.collapsedFolders = nextCollapsedFolders;

  if (state.activePath && (state.activePath === path || state.activePath.startsWith(`${path}/`))) {
    state.activePath = chooseFallbackPath();
  }

  recomputeStructureChanged();
  updateFileEditingState();

  if (state.activePath) {
    selectFile(state.activePath);
  } else {
    activeFileName.textContent = t("select_file");
    fileMeta.textContent = "";
    showPane("empty");
    updateRevertButtonState();
  }
}

async function importDroppedFiles(fileList, parentPath = "") {
  const files = Array.from(fileList || []);
  if (!files.length) {
    return;
  }

  let lastImportedPath = null;

  for (const dropped of files) {
    const baseName = normalizePath(dropped.name);
    if (!baseName) {
      continue;
    }

    const requestedPath = joinPath(parentPath, baseName);
    const targetPath = ensureUniquePath(requestedPath);
    const bytes = new Uint8Array(await dropped.arrayBuffer());

    const record = createRecordFromBytes(targetPath, bytes, dropped.type || "", true);
    state.files.set(targetPath, record);
    lastImportedPath = targetPath;
  }

  if (lastImportedPath) {
    recomputeStructureChanged();
    updateFileEditingState();
    selectFile(lastImportedPath);
  }
}

function resolveDropParentPath(target) {
  const row = target.closest(".tree-node");
  if (!row) {
    return "";
  }

  const path = row.dataset.path || "";
  const kind = row.dataset.kind;

  if (kind === "folder") {
    return path;
  }

  if (kind === "file") {
    return getParentPath(path);
  }

  return "";
}

async function loadArchive(file) {
  if (!isSupportedArchive(file)) {
    setStatus(t("error_choose_archive"), true);
    return;
  }

  clearState();

  try {
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files).sort((a, b) => a.name.localeCompare(b.name));
    const fileEntries = entries.filter((entry) => !entry.dir);

    entries.forEach((entry) => {
      if (entry.dir) {
        const folderPath = normalizeFolderPath(entry.name);
        if (folderPath) {
          state.explicitFolders.add(folderPath);
        }
      }
    });

    for (const entry of fileEntries) {
      const path = normalizePath(entry.name);
      const bytes = await entry.async("uint8array");
      const record = createRecordFromBytes(path, bytes);
      state.files.set(path, record);
    }

    state.archiveName = file.name;
    state.originalFilePaths = new Set(state.files.keys());
    state.originalFolders = getAllFolderPaths();
    recomputeStructureChanged();

    archiveName.textContent = file.name;
    dropzone.classList.add("hidden");
    workspace.classList.remove("hidden");

    renderTree();
    updateDownloadButtonState();
    schedulePersistState();

    if (fileEntries.length > 0) {
      const firstPath = normalizePath(fileEntries[0].name);
      selectFile(firstPath);
    } else {
      showPane("empty");
      activeFileName.textContent = t("archive_has_no_files");
      fileMeta.textContent = "";
      updateRevertButtonState();
    }
  } catch (error) {
    clearState();
    setStatus(t("error_open_archive", { message: error.message }), true);
  }
}

function chooseFallbackPath() {
  const allPaths = Array.from(state.files.keys()).sort((a, b) => a.localeCompare(b));
  if (!allPaths.length) {
    return null;
  }
  return allPaths[0];
}

function incrementVersionString(value) {
  const source = String(value ?? "");
  const match = source.match(/(\d+)(?!.*\d)/);
  if (!match || match.index === undefined) {
    return source;
  }
  const start = match.index;
  const end = start + match[1].length;
  const next = String(Number(match[1]) + 1);
  return `${source.slice(0, start)}${next}${source.slice(end)}`;
}

function bumpPluginVersionForExport() {
  const pluginRecord = state.files.get("plugin.yaml");
  if (!pluginRecord || pluginRecord.kind !== "text") {
    return;
  }

  const original = pluginRecord.currentText;
  let changed = false;

  const updated = original.replace(
    /^(\s*version\s*:\s*)(["']?)([^"'#\n]+)(\2)(\s*(?:#.*)?)$/m,
    (full, prefix, quote, rawValue, closingQuote, suffix) => {
      const nextValue = incrementVersionString(rawValue.trim());
      if (nextValue === rawValue.trim()) {
        return full;
      }
      changed = true;
      return `${prefix}${quote}${nextValue}${closingQuote}${suffix || ""}`;
    },
  );

  if (!changed) {
    return;
  }

  pluginRecord.currentText = updated;
  updateRecordFlags(pluginRecord);
  updateFileEditingState();
  if (state.activePath === "plugin.yaml") {
    selectFile("plugin.yaml");
  }
}

function revertActiveFileChanges() {
  if (!state.activePath) {
    return;
  }

  const record = state.files.get(state.activePath);
  if (!record) {
    return;
  }

  const activePath = state.activePath;

  if (record.isNew && record.initialPath === null) {
    revokePreviewUrl(record);
    state.files.delete(activePath);
    state.activePath = chooseFallbackPath();

    recomputeStructureChanged();
    updateFileEditingState();

    if (state.activePath) {
      selectFile(state.activePath);
    } else {
      activeFileName.textContent = t("select_file");
      fileMeta.textContent = "";
      showPane("empty");
      updateRevertButtonState();
    }
    return;
  }

  const originalPath = record.initialPath || activePath;

  if (originalPath !== activePath) {
    if (state.files.has(originalPath)) {
      setStatus(t("error_revert_path_occupied"), true);
      return;
    }

    state.files.delete(activePath);
    record.path = originalPath;
    record.mime = getMimeType(originalPath);
    record.kind = detectKind(originalPath);
    state.files.set(originalPath, record);
    state.activePath = originalPath;
  }

  if (record.kind === "text" || record.kind === "svg") {
    record.currentText = record.originalText;
  }

  updateRecordFlags(record);
  recomputeStructureChanged();
  updateFileEditingState();
  selectFile(record.path);
}

function uint8ArrayToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function persistStateNow() {
  try {
    if (!state.archiveName && state.files.size === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const payload = {
      archiveName: state.archiveName,
      activePath: state.activePath,
      explicitFolders: Array.from(state.explicitFolders),
      collapsedFolders: Array.from(state.collapsedFolders),
      originalFilePaths: Array.from(state.originalFilePaths),
      originalFolders: Array.from(state.originalFolders),
      files: Array.from(state.files.values()).map((record) => {
        const serial = {
          path: record.path,
          initialPath: record.initialPath,
          kind: record.kind,
          mime: record.mime,
          originalText: record.originalText,
          currentText: record.currentText,
        };

        if (record.kind === "image" || record.kind === "binary") {
          serial.bytesBase64 = uint8ArrayToBase64(record.originalBytes || new Uint8Array());
        }

        return serial;
      }),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    setStatus(t("error_persist_state", { message: error.message }), true);
  }
}

function schedulePersistState() {
  if (persistTimer) {
    window.clearTimeout(persistTimer);
  }

  persistTimer = window.setTimeout(() => {
    persistStateNow();
  }, 500);
}

function restoreStateFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return false;
  }

  try {
    const payload = JSON.parse(raw);
    if (!payload || !Array.isArray(payload.files)) {
      return false;
    }

    clearState();

    state.archiveName = payload.archiveName || "restored.edp";
    state.activePath = payload.activePath || null;
    state.explicitFolders = new Set((payload.explicitFolders || []).map((folder) => normalizeFolderPath(folder)));
    state.collapsedFolders = new Set((payload.collapsedFolders || []).map((folder) => normalizeFolderPath(folder)));

    payload.files.forEach((item) => {
      const path = normalizePath(item.path || "");
      if (!path) {
        return;
      }

      let originalBytes = new Uint8Array();
      if ((item.kind === "image" || item.kind === "binary") && item.bytesBase64) {
        originalBytes = base64ToUint8Array(item.bytesBase64);
      }

      const record = {
        path,
        initialPath: typeof item.initialPath === "string" ? item.initialPath : null,
        kind: item.kind || detectKind(path),
        mime: item.mime || getMimeType(path),
        originalBytes,
        originalText: item.originalText || "",
        currentText: item.currentText || "",
        contentChanged: false,
        pathChanged: false,
        isNew: false,
        previewUrl: null,
        treeThumbUrl: null,
        treeThumbSource: null,
        treeThumbColor: null,
      };

      if (record.kind === "text" || record.kind === "svg") {
        if (!record.currentText && record.originalText) {
          record.currentText = record.originalText;
        }
        if (!record.originalText) {
          record.originalText = record.currentText;
        }
      }

      record.isNew = record.initialPath === null;
      updateRecordFlags(record);
      state.files.set(path, record);
    });

    state.originalFilePaths = new Set((payload.originalFilePaths || []).map((filePath) => normalizePath(filePath)));
    state.originalFolders = new Set((payload.originalFolders || []).map((folder) => normalizeFolderPath(folder)));

    if (state.originalFilePaths.size === 0 && state.files.size > 0) {
      state.originalFilePaths = new Set(
        Array.from(state.files.values())
          .filter((record) => record.initialPath)
          .map((record) => record.initialPath),
      );
    }

    if (state.originalFolders.size === 0) {
      state.originalFolders = getAllFolderPaths();
    }

    recomputeStructureChanged();

    archiveName.textContent = state.archiveName;
    dropzone.classList.add("hidden");
    workspace.classList.remove("hidden");

    renderTree();
    updateDownloadButtonState();

    const fallbackPath = chooseFallbackPath();
    const nextPath = state.activePath && state.files.has(state.activePath) ? state.activePath : fallbackPath;

    if (nextPath) {
      selectFile(nextPath);
    } else {
      showPane("empty");
      updateRevertButtonState();
    }

    return true;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return false;
  }
}

downloadBtn.addEventListener("click", async () => {
  if (downloadBtn.disabled) {
    return;
  }

  try {
    bumpPluginVersionForExport();
    const nextZip = new JSZip();

    Array.from(getAllFolderPaths())
      .sort((a, b) => a.localeCompare(b))
      .forEach((folderPath) => {
        nextZip.folder(folderPath);
      });

    state.files.forEach((record) => {
      if (isArchivePath(record.path)) {
        return;
      }
      if (record.kind === "text" || record.kind === "svg") {
        nextZip.file(record.path, record.currentText);
      } else {
        nextZip.file(record.path, record.originalBytes);
      }
    });

    const blob = await nextZip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const outputName = state.archiveName || "plugin.edp";

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = outputName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    setStatus(t("error_export_archive", { message: error.message }), true);
  }
});

addRootBtn.innerHTML = ICONS.plus;

addRootBtn.addEventListener("click", () => handleCreateItem(""));
if (sidebarTitle) {
  sidebarTitle.addEventListener("click", () => toggleSidebarCollapsed());
  sidebarTitle.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleSidebarCollapsed();
    }
  });
}
revertFileBtn.addEventListener("click", revertActiveFileChanges);
if (previewColorInput) {
  previewColorInput.addEventListener("input", (event) => {
    const value = event.target?.value || DEFAULT_SVG_PREVIEW_COLOR;
    setSvgPreviewColor(value, true);
  });
}
if (publishPluginBtn) {
  publishPluginBtn.addEventListener("click", () => {
    window.open("https://plugins.every-door.app/upload", "_blank", "noopener,noreferrer");
  });
}
if (docsBtn) {
  docsBtn.addEventListener("click", () => {
    window.open("https://every-door.app/plugins/metadata/", "_blank", "noopener,noreferrer");
  });
}
openAnotherBtn.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  toggleOpenAnotherMenu();
});

if (openArchiveFileBtn) {
  openArchiveFileBtn.addEventListener("click", () => {
    closeOpenAnotherMenu();
    fileInput.click();
  });
}

if (openArchiveLinkBtn) {
  openArchiveLinkBtn.addEventListener("click", async () => {
    closeOpenAnotherMenu();
    await loadArchiveFromUrl();
  });
}

if (openGithubRepoBtn) {
  openGithubRepoBtn.addEventListener("click", async () => {
    closeOpenAnotherMenu();
    await loadGithubRepositoryFiles();
  });
}

if (openTemplateBtn) {
  openTemplateBtn.addEventListener("click", () => {
    closeOpenAnotherMenu();
    createSamplePlugin();
  });
}

document.addEventListener("click", (event) => {
  if (!openAnotherMenu || !openAnotherBtn) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }
  if (!openAnotherMenu.contains(target) && !openAnotherBtn.contains(target)) {
    closeOpenAnotherMenu();
  }
});

document.addEventListener("keydown", (event) => {
  const isSaveShortcut = (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s";
  if (isSaveShortcut) {
    event.preventDefault();
    if (!downloadBtn.disabled) {
      downloadBtn.click();
    }
    return;
  }

  if (event.key === "Escape") {
    closeOpenAnotherMenu();
  }
});

dropzone.addEventListener("click", () => fileInput.click());
if (createSampleBtn) {
  createSampleBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    createSamplePlugin();
  });
}

fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files || [];
  if (file) {
    loadArchive(file);
  }
  fileInput.value = "";
});

iconsUploadInput.addEventListener("change", async (event) => {
  const files = event.target?.files;
  if (!files || !files.length) {
    return;
  }
  const targetFolder = normalizeFolderPath(iconsUploadInput.dataset.targetFolder || "icons");
  await importDroppedFiles(files, targetFolder);
  iconsUploadInput.value = "";
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropzone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropzone.classList.remove("drag-over");
  });
});

dropzone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer?.files || [];
  if (file) {
    loadArchive(file);
  }
});

fileTree.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
  fileTree.classList.add("drag-over");
});

fileTree.addEventListener("dragleave", (event) => {
  event.preventDefault();
  event.stopPropagation();
  const next = event.relatedTarget;
  if (!next || !fileTree.contains(next)) {
    fileTree.classList.remove("drag-over");
  }
});

fileTree.addEventListener("drop", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  fileTree.classList.remove("drag-over");

  const files = event.dataTransfer?.files;
  if (!files || !files.length) {
    return;
  }

  const parentPath = resolveDropParentPath(event.target);
  await importDroppedFiles(files, parentPath);
});

imagePreview.addEventListener("load", () => applyPreviewScale(imagePreview));
svgPreview.addEventListener("load", () => applyPreviewScale(svgPreview));

window.addEventListener("beforeunload", () => {
  persistStateNow();
});

applyStaticTranslations();
restoreSidebarWidth();
restoreSidebarCollapsedState();
restoreSvgPreviewWidth();
restoreSvgPreviewColor();
initPanelResizer();
initSvgPaneResizer();
initializeCodeEditors();
clearState();
restoreStateFromStorage();
document.body.classList.add("app-ready");
