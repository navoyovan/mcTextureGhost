using System.IO;
using System.Text.Json;

namespace McTextureGhost.Services.Scanning;

/// <summary>
/// Parsed detail for a Minecraft Bedrock client entity or attachable definition.
/// </summary>
public record ClientEntityDetails(
    string Identifier,
    Dictionary<string, string> Textures,
    Dictionary<string, string> Geometries,
    bool IsAttachable
);

/// <summary>
/// Parser for Minecraft Bedrock entity_client and attachables JSON definitions.
/// Extracts declared entity IDs, texture slots, geometry mappings, and attachable state.
/// </summary>
public static class EntityDefinitionParser
{
    /// <summary>
    /// Parses a Minecraft Bedrock client entity or attachable JSON file and extracts
    /// all declared entity IDs, texture slots, geometry mappings, and attachable state.
    /// </summary>
    public static List<ClientEntityDetails> ParseClientEntityDetails(string filePath)
    {
        var result = new List<ClientEntityDetails>();
        if (!File.Exists(filePath)) return result;

        try
        {
            using var stream = ScanningJsonUtils.OpenSharedRead(filePath);
            using var doc = JsonDocument.Parse(stream, ScanningJsonUtils.ScanDocOptions);
            return ParseClientEntityDetails(doc);
        }
        catch
        {
            return result;
        }
    }

    /// <summary>
    /// Parses a Minecraft Bedrock client entity or attachable JsonDocument and extracts
    /// all declared entity IDs, texture slots, geometry mappings, and attachable state.
    /// </summary>
    public static List<ClientEntityDetails> ParseClientEntityDetails(JsonDocument doc)
    {
        var result = new List<ClientEntityDetails>();
        if (doc.RootElement.ValueKind != JsonValueKind.Object) return result;

        foreach (var rootProp in doc.RootElement.EnumerateObject())
        {
            bool isClientEntity = rootProp.Name.Equals("minecraft:client_entity", StringComparison.OrdinalIgnoreCase);
            bool isAttachable = rootProp.Name.Equals("minecraft:attachable", StringComparison.OrdinalIgnoreCase);

            if (!isClientEntity && !isAttachable) continue;
            if (rootProp.Value.ValueKind != JsonValueKind.Object) continue;

            if (rootProp.Value.TryGetProperty("description", out var desc) && desc.ValueKind == JsonValueKind.Object)
            {
                string? identifier = null;
                if (desc.TryGetProperty("identifier", out var idProp) && idProp.ValueKind == JsonValueKind.String)
                {
                    identifier = idProp.GetString();
                }

                if (string.IsNullOrWhiteSpace(identifier)) continue;

                var texturesDict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                if (desc.TryGetProperty("textures", out var texProp))
                {
                    if (texProp.ValueKind == JsonValueKind.Object)
                    {
                        foreach (var slot in texProp.EnumerateObject())
                        {
                            if (slot.Value.ValueKind == JsonValueKind.String)
                            {
                                var val = slot.Value.GetString();
                                if (!string.IsNullOrWhiteSpace(val))
                                {
                                    texturesDict[slot.Name] = val;
                                }
                            }
                        }
                    }
                    else if (texProp.ValueKind == JsonValueKind.String)
                    {
                        var val = texProp.GetString();
                        if (!string.IsNullOrWhiteSpace(val))
                        {
                            texturesDict["default"] = val;
                        }
                    }
                }

                var geometriesDict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                if (desc.TryGetProperty("geometry", out var geoProp))
                {
                    if (geoProp.ValueKind == JsonValueKind.Object)
                    {
                        foreach (var slot in geoProp.EnumerateObject())
                        {
                            if (slot.Value.ValueKind == JsonValueKind.String)
                            {
                                var val = slot.Value.GetString();
                                if (!string.IsNullOrWhiteSpace(val))
                                {
                                    geometriesDict[slot.Name] = val;
                                }
                            }
                        }
                    }
                    else if (geoProp.ValueKind == JsonValueKind.String)
                    {
                        var val = geoProp.GetString();
                        if (!string.IsNullOrWhiteSpace(val))
                        {
                            geometriesDict["default"] = val;
                        }
                    }
                }

                if (texturesDict.Count > 0 || geometriesDict.Count > 0)
                {
                    result.Add(new ClientEntityDetails(identifier, texturesDict, geometriesDict, isAttachable));
                }
            }
        }

        return result;
    }

    /// <summary>
    /// Legacy compatibility helper: Parses a Minecraft Bedrock client entity or attachable JSON file and extracts
    /// all declared entity IDs and their texture slot dictionary (slotName -> texturePath).
    /// </summary>
    public static Dictionary<string, Dictionary<string, string>> ParseClientEntityFile(string filePath)
    {
        var result = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
        var details = ParseClientEntityDetails(filePath);
        foreach (var d in details)
        {
            result[d.Identifier] = d.Textures;
        }
        return result;
    }

    /// <summary>
    /// Legacy compatibility helper: Parses a Minecraft Bedrock client entity or attachable JsonDocument and extracts
    /// all declared entity IDs and their texture slot dictionary (slotName -> texturePath).
    /// </summary>
    public static Dictionary<string, Dictionary<string, string>> ParseClientEntity(JsonDocument doc)
    {
        var result = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
        var details = ParseClientEntityDetails(doc);
        foreach (var d in details)
        {
            result[d.Identifier] = d.Textures;
        }
        return result;
    }
}
