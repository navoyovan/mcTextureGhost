using System.ComponentModel;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace McTextureGhost.Models;

/// <summary>
/// Represents Minecraft Bedrock manifest.json header and module metadata.
/// Provides two-way data binding, UUID generation, validation, and serialization.
/// </summary>
public class ManifestModel : INotifyPropertyChanged
{
    private string _headerName = "My Resource Pack";
    public string HeaderName
    {
        get => _headerName;
        set { if (_headerName != value) { _headerName = value; OnPropertyChanged(); } }
    }

    private string _headerDescription = "Bedrock resource pack created with McTextureGhost";
    public string HeaderDescription
    {
        get => _headerDescription;
        set { if (_headerDescription != value) { _headerDescription = value; OnPropertyChanged(); } }
    }

    private string _headerUuid = Guid.NewGuid().ToString();
    public string HeaderUuid
    {
        get => _headerUuid;
        set { if (_headerUuid != value) { _headerUuid = value; OnPropertyChanged(); } }
    }

    private int _versionMajor = 1;
    public int VersionMajor
    {
        get => _versionMajor;
        set { if (_versionMajor != value) { _versionMajor = value; OnPropertyChanged(); OnPropertyChanged(nameof(VersionString)); } }
    }

    private int _versionMinor = 0;
    public int VersionMinor
    {
        get => _versionMinor;
        set { if (_versionMinor != value) { _versionMinor = value; OnPropertyChanged(); OnPropertyChanged(nameof(VersionString)); } }
    }

    private int _versionPatch = 0;
    public int VersionPatch
    {
        get => _versionPatch;
        set { if (_versionPatch != value) { _versionPatch = value; OnPropertyChanged(); OnPropertyChanged(nameof(VersionString)); } }
    }

    public string VersionString => $"{VersionMajor}.{VersionMinor}.{VersionPatch}";

    private int _minEngineMajor = 1;
    public int MinEngineMajor
    {
        get => _minEngineMajor;
        set { if (_minEngineMajor != value) { _minEngineMajor = value; OnPropertyChanged(); OnPropertyChanged(nameof(MinEngineString)); } }
    }

    private int _minEngineMinor = 20;
    public int MinEngineMinor
    {
        get => _minEngineMinor;
        set { if (_minEngineMinor != value) { _minEngineMinor = value; OnPropertyChanged(); OnPropertyChanged(nameof(MinEngineString)); } }
    }

    private int _minEnginePatch = 0;
    public int MinEnginePatch
    {
        get => _minEnginePatch;
        set { if (_minEnginePatch != value) { _minEnginePatch = value; OnPropertyChanged(); OnPropertyChanged(nameof(MinEngineString)); } }
    }

    public string MinEngineString => $"{MinEngineMajor}.{MinEngineMinor}.{MinEnginePatch}";

    private string _moduleUuid = Guid.NewGuid().ToString();
    public string ModuleUuid
    {
        get => _moduleUuid;
        set { if (_moduleUuid != value) { _moduleUuid = value; OnPropertyChanged(); } }
    }

    private string _moduleType = "resources";
    public string ModuleType
    {
        get => _moduleType;
        set { if (_moduleType != value) { _moduleType = value; OnPropertyChanged(); } }
    }

    private int _moduleVersionMajor = 1;
    public int ModuleVersionMajor
    {
        get => _moduleVersionMajor;
        set { if (_moduleVersionMajor != value) { _moduleVersionMajor = value; OnPropertyChanged(); } }
    }

    private int _moduleVersionMinor = 0;
    public int ModuleVersionMinor
    {
        get => _moduleVersionMinor;
        set { if (_moduleVersionMinor != value) { _moduleVersionMinor = value; OnPropertyChanged(); } }
    }

    private int _moduleVersionPatch = 0;
    public int ModuleVersionPatch
    {
        get => _moduleVersionPatch;
        set { if (_moduleVersionPatch != value) { _moduleVersionPatch = value; OnPropertyChanged(); } }
    }

    private int _formatVersion = 2;
    public int FormatVersion
    {
        get => _formatVersion;
        set { if (_formatVersion != value) { _formatVersion = value; OnPropertyChanged(); } }
    }

    private bool _fileExists;
    public bool FileExists
    {
        get => _fileExists;
        set { if (_fileExists != value) { _fileExists = value; OnPropertyChanged(); } }
    }

    private string? _filePath;
    public string? FilePath
    {
        get => _filePath;
        set { if (_filePath != value) { _filePath = value; OnPropertyChanged(); } }
    }

    /// <summary>
    /// Generates a fresh Header UUID.
    /// </summary>
    public void RegenerateHeaderUuid()
    {
        HeaderUuid = Guid.NewGuid().ToString();
    }

    /// <summary>
    /// Generates a fresh Module UUID distinct from the Header UUID.
    /// </summary>
    public void RegenerateModuleUuid()
    {
        var newUuid = Guid.NewGuid().ToString();
        while (string.Equals(newUuid, HeaderUuid, StringComparison.OrdinalIgnoreCase))
        {
            newUuid = Guid.NewGuid().ToString();
        }
        ModuleUuid = newUuid;
    }

    /// <summary>
    /// Creates a default manifest model populated with generated UUIDs and folder-based name.
    /// </summary>
    public static ManifestModel CreateDefault(string packName, string? filePath = null)
    {
        var model = new ManifestModel
        {
            HeaderName = string.IsNullOrWhiteSpace(packName) ? "My Resource Pack" : packName,
            HeaderDescription = "Bedrock resource pack created with McTextureGhost",
            HeaderUuid = Guid.NewGuid().ToString(),
            VersionMajor = 1,
            VersionMinor = 0,
            VersionPatch = 0,
            MinEngineMajor = 1,
            MinEngineMinor = 20,
            MinEnginePatch = 0,
            ModuleUuid = Guid.NewGuid().ToString(),
            ModuleType = "resources",
            ModuleVersionMajor = 1,
            ModuleVersionMinor = 0,
            ModuleVersionPatch = 0,
            FormatVersion = 2,
            FileExists = filePath != null && File.Exists(filePath),
            FilePath = filePath
        };

        // Guarantee distinct UUIDs
        while (string.Equals(model.ModuleUuid, model.HeaderUuid, StringComparison.OrdinalIgnoreCase))
        {
            model.ModuleUuid = Guid.NewGuid().ToString();
        }

        return model;
    }

    /// <summary>
    /// Loads and parses an existing manifest.json file, or creates defaults if missing/corrupt.
    /// </summary>
    public static ManifestModel LoadFromFile(string filePath, string fallbackPackName = "Pack")
    {
        if (!File.Exists(filePath))
        {
            return CreateDefault(fallbackPackName, filePath);
        }

        try
        {
            var content = File.ReadAllText(filePath);
            var jsonNode = JsonNode.Parse(content, new JsonNodeOptions(), new JsonDocumentOptions
            {
                AllowTrailingCommas = true,
                CommentHandling = JsonCommentHandling.Skip
            });

            if (jsonNode is not JsonObject root)
            {
                return CreateDefault(fallbackPackName, filePath);
            }

            var model = new ManifestModel
            {
                FilePath = filePath,
                FileExists = true
            };

            if (root.TryGetPropertyValue("format_version", out var fvNode) && fvNode != null)
            {
                if (fvNode is JsonValue val && val.TryGetValue<int>(out var fv))
                    model.FormatVersion = fv;
            }

            if (root.TryGetPropertyValue("header", out var headerNode) && headerNode is JsonObject header)
            {
                if (header.TryGetPropertyValue("name", out var nameNode) && nameNode != null)
                    model.HeaderName = nameNode.ToString();
                else
                    model.HeaderName = fallbackPackName;

                if (header.TryGetPropertyValue("description", out var descNode) && descNode != null)
                    model.HeaderDescription = descNode.ToString();

                if (header.TryGetPropertyValue("uuid", out var uuidNode) && uuidNode != null)
                    model.HeaderUuid = uuidNode.ToString();

                if (header.TryGetPropertyValue("version", out var verNode) && verNode is JsonArray verArr)
                {
                    if (verArr.Count > 0 && verArr[0] is JsonValue v0 && v0.TryGetValue<int>(out var maj)) model.VersionMajor = maj;
                    if (verArr.Count > 1 && verArr[1] is JsonValue v1 && v1.TryGetValue<int>(out var min)) model.VersionMinor = min;
                    if (verArr.Count > 2 && verArr[2] is JsonValue v2 && v2.TryGetValue<int>(out var pat)) model.VersionPatch = pat;
                }

                if (header.TryGetPropertyValue("min_engine_version", out var meNode) && meNode is JsonArray meArr)
                {
                    if (meArr.Count > 0 && meArr[0] is JsonValue e0 && e0.TryGetValue<int>(out var eMaj)) model.MinEngineMajor = eMaj;
                    if (meArr.Count > 1 && meArr[1] is JsonValue e1 && e1.TryGetValue<int>(out var eMin)) model.MinEngineMinor = eMin;
                    if (meArr.Count > 2 && meArr[2] is JsonValue e2 && e2.TryGetValue<int>(out var ePat)) model.MinEnginePatch = ePat;
                }
            }

            if (root.TryGetPropertyValue("modules", out var modulesNode) && modulesNode is JsonArray modules)
            {
                JsonObject? resModule = null;
                foreach (var mod in modules)
                {
                    if (mod is JsonObject modObj &&
                        modObj.TryGetPropertyValue("type", out var typeNode) &&
                        string.Equals(typeNode?.ToString(), "resources", StringComparison.OrdinalIgnoreCase))
                    {
                        resModule = modObj;
                        break;
                    }
                }

                resModule ??= modules.FirstOrDefault() as JsonObject;

                if (resModule != null)
                {
                    if (resModule.TryGetPropertyValue("type", out var typeNode) && typeNode != null)
                        model.ModuleType = typeNode.ToString();

                    if (resModule.TryGetPropertyValue("uuid", out var mUuidNode) && mUuidNode != null)
                        model.ModuleUuid = mUuidNode.ToString();

                    if (resModule.TryGetPropertyValue("version", out var mVerNode) && mVerNode is JsonArray mVerArr)
                    {
                        if (mVerArr.Count > 0 && mVerArr[0] is JsonValue mv0 && mv0.TryGetValue<int>(out var maj)) model.ModuleVersionMajor = maj;
                        if (mVerArr.Count > 1 && mVerArr[1] is JsonValue mv1 && mv1.TryGetValue<int>(out var min)) model.ModuleVersionMinor = min;
                        if (mVerArr.Count > 2 && mVerArr[2] is JsonValue mv2 && mv2.TryGetValue<int>(out var pat)) model.ModuleVersionPatch = pat;
                    }
                }
            }

            return model;
        }
        catch
        {
            return CreateDefault(fallbackPackName, filePath);
        }
    }

    /// <summary>
    /// Saves the manifest to disk. If file already exists, preserves extraneous properties.
    /// </summary>
    public void SaveToFile(string filePath)
    {
        JsonObject root;
        if (File.Exists(filePath))
        {
            try
            {
                var existing = File.ReadAllText(filePath);
                var parsed = JsonNode.Parse(existing, new JsonNodeOptions(), new JsonDocumentOptions
                {
                    AllowTrailingCommas = true,
                    CommentHandling = JsonCommentHandling.Skip
                });
                root = parsed as JsonObject ?? new JsonObject();
            }
            catch
            {
                root = new JsonObject();
            }
        }
        else
        {
            root = new JsonObject();
        }

        root["format_version"] = FormatVersion;

        JsonObject headerObj;
        if (root.TryGetPropertyValue("header", out var existingHeader) && existingHeader is JsonObject hObj)
            headerObj = hObj;
        else
            root["header"] = headerObj = new JsonObject();

        headerObj["name"] = HeaderName;
        headerObj["description"] = HeaderDescription;
        headerObj["uuid"] = HeaderUuid;
        headerObj["version"] = new JsonArray { VersionMajor, VersionMinor, VersionPatch };
        headerObj["min_engine_version"] = new JsonArray { MinEngineMajor, MinEngineMinor, MinEnginePatch };

        JsonArray modulesArr;
        if (root.TryGetPropertyValue("modules", out var existingModules) && existingModules is JsonArray mArr)
            modulesArr = mArr;
        else
            root["modules"] = modulesArr = new JsonArray();

        JsonObject? targetModule = null;
        foreach (var mod in modulesArr)
        {
            if (mod is JsonObject mObj &&
                mObj.TryGetPropertyValue("type", out var typeNode) &&
                string.Equals(typeNode?.ToString(), ModuleType, StringComparison.OrdinalIgnoreCase))
            {
                targetModule = mObj;
                break;
            }
        }

        if (targetModule == null)
        {
            targetModule = new JsonObject();
            modulesArr.Insert(0, targetModule);
        }

        targetModule["type"] = ModuleType;
        targetModule["uuid"] = ModuleUuid;
        targetModule["version"] = new JsonArray { ModuleVersionMajor, ModuleVersionMinor, ModuleVersionPatch };

        var directory = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }

        using (var stream = File.Create(filePath))
        using (var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Indented = true }))
        {
            root.WriteTo(writer);
        }

        FilePath = filePath;
        FileExists = true;
        OnPropertyChanged(nameof(FileExists));
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
