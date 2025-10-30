using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;
using System.Drawing;

class ColorPrint
{
    static void Main(string[] args)
    {
    // Do not join args into a single string. Preserve the original args array so quoted values aren't broken.

        // If user asked for help or provided no args, print usage and exit
        if (args == null || args.Length == 0 || args.Any(a => string.Equals(a, "help", StringComparison.OrdinalIgnoreCase) || string.Equals(a, "--help", StringComparison.OrdinalIgnoreCase) || string.Equals(a, "-h", StringComparison.OrdinalIgnoreCase)))
        {
            PrintHelp();
            return;
        }

    // Load color definitions from colors.yml (flattened, lowercase keys) located next to the executable
    var colors = LoadColors("colors.yml");

        // Parse arguments
    string bgColorName = GetArgValue(args, "background");
    string textColorName = GetArgValue(args, "text");
    string bgHex = GetArgValue(args, "backgroundhex");
    string textHex = GetArgValue(args, "texthex");
    string message = GetArgValue(args, "print") ?? string.Empty;

    // Resolve colors
    var background = ResolveColor(bgHex, bgColorName, colors);
    var text = ResolveColor(textHex, textColorName, colors);

    // Set console colors (closest console color is always available)
    ConsoleColor bgConsole = ClosestConsoleColor(background);
    ConsoleColor textConsole = ClosestConsoleColor(text);

    Console.BackgroundColor = bgConsole;
    Console.ForegroundColor = textConsole;

        // Print message
        Console.WriteLine(message);

        // Reset console colors
        Console.ResetColor();
    }

    static Dictionary<string, string> LoadColors(string filePath)
    {
        try
        {
            // Prefer colors.yml sitting next to the executable
            string baseDir = AppDomain.CurrentDomain.BaseDirectory ?? Directory.GetCurrentDirectory();
            string exePath = Path.Combine(baseDir, filePath);

            string readPath = File.Exists(exePath) ? exePath : filePath;

            var yaml = File.ReadAllText(readPath);
            var deserializer = new DeserializerBuilder()
                .WithNamingConvention(CamelCaseNamingConvention.Instance)
                .Build();

            var nested = deserializer.Deserialize<Dictionary<string, Dictionary<string, string>>>(yaml);
            // Flatten categories and normalize keys to lower-case for reliable lookup
            var flat = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (nested != null)
            {
                foreach (var category in nested.Values)
                {
                    foreach (var kv in category)
                    {
                        if (kv.Key == null || kv.Value == null) continue;
                        var key = kv.Key.Trim().ToLowerInvariant();
                        if (!flat.ContainsKey(key))
                            flat[key] = kv.Value.Trim();
                    }
                }
            }
            return flat;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Error] Could not load colors.yml: {ex.Message}");
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }
    }

    static string GetArgValue(string[] args, string key)
    {
        if (args == null || args.Length == 0) return null;

        // First try key:value in any arg
        string prefix = key + ":";
        foreach (var a in args)
        {
            if (a.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                var val = a.Substring(prefix.Length);
                // trim enclosing quotes if present
                if (val.Length >= 2 && ((val.StartsWith("\"") && val.EndsWith("\"")) || (val.StartsWith("'") && val.EndsWith("'"))))
                    return val.Substring(1, val.Length - 2);
                return val;
            }
        }

        // Next try key followed by value as separate args: key "value with spaces"
        for (int i = 0; i < args.Length; i++)
        {
            if (string.Equals(args[i], key, StringComparison.OrdinalIgnoreCase) ||
                args[i].Equals($"--{key}", StringComparison.OrdinalIgnoreCase) ||
                args[i].Equals($"-{key}", StringComparison.OrdinalIgnoreCase))
            {
                if (i + 1 < args.Length)
                {
                    var val = args[i + 1];
                    // trim enclosing quotes
                    if (val.Length >= 2 && ((val.StartsWith("\"") && val.EndsWith("\"")) || (val.StartsWith("'") && val.EndsWith("'"))))
                        return val.Substring(1, val.Length - 2);
                    return val;
                }
            }
        }

        return null;
    }

    static Color ResolveColor(string hex, string name, Dictionary<string, string> colors)
    {
        // Try hex first (user-supplied). Be forgiving and safe.
        if (!string.IsNullOrWhiteSpace(hex))
        {
            try
            {
                return ColorTranslator.FromHtml(hex.Trim());
            }
            catch
            {
                // fall through to named lookup
            }
        }

        if (string.IsNullOrWhiteSpace(name))
            return Color.White;

        var key = name.Trim().ToLowerInvariant();
        if (colors != null && colors.TryGetValue(key, out string value))
        {
            try
            {
                return ColorTranslator.FromHtml(value);
            }
            catch
            {
                // ignore and fall back
            }
        }

        return Color.White; // default fallback
    }

    static ConsoleColor ClosestConsoleColor(Color color)
    {
        var consoleColors = Enum.GetValues(typeof(ConsoleColor)).Cast<ConsoleColor>();
        ConsoleColor closest = ConsoleColor.White;
        double minDistance = double.MaxValue;

        foreach (var consoleColor in consoleColors)
        {
            var cc = GetColor(consoleColor);
            double distance = Math.Pow(cc.R - color.R, 2) +
                              Math.Pow(cc.G - color.G, 2) +
                              Math.Pow(cc.B - color.B, 2);
            if (distance < minDistance)
            {
                minDistance = distance;
                closest = consoleColor;
            }
        }
        return closest;
    }

    static Color GetColor(ConsoleColor color)
    {
        int[] colorMap = {
            0x000000, 0x000080, 0x008000, 0x008080, 0x800000, 0x800080, 0x808000, 0xC0C0C0,
            0x808080, 0x0000FF, 0x00FF00, 0x00FFFF, 0xFF0000, 0xFF00FF, 0xFFFF00, 0xFFFFFF
        };
        int rgb = colorMap[(int)color];
        return Color.FromArgb((rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF);
    }

    // Simple brightness calculation (0..255). Use to ensure readable contrast.
    static double Brightness(Color c)
    {
        return (0.299 * c.R + 0.587 * c.G + 0.114 * c.B);
    }

    static bool HasSufficientContrast(Color bg, Color fg)
    {
        return Math.Abs(Brightness(bg) - Brightness(fg)) >= 80; // heuristic threshold
    }

    static void PrintHelp()
    {
        Console.WriteLine("colorprint — print colored text to the console\n");
        Console.WriteLine("Usage:");
        Console.WriteLine("  colorprint print:\"Your message here\" text:blue background:#000000");
        Console.WriteLine("  colorprint print:\"Hello\" texthex:#ff8800 backgroundhex:#222222");
        Console.WriteLine("  colorprint help\n");
        Console.WriteLine("Options:");
        Console.WriteLine("  print:<message>       Message to print (wrap with quotes if it contains spaces)");
        Console.WriteLine("  text:<name>           Color name from colors.yml (case-insensitive)");
        Console.WriteLine("  background:<name>     Background color name from colors.yml");
        Console.WriteLine("  texthex:<#RRGGBB>     Use a hex color for text (falls back to named color if invalid)");
        Console.WriteLine("  backgroundhex:<#RRGGBB> Use a hex color for background\n");
        Console.WriteLine("Examples of colors.yml structure:");
        Console.WriteLine("  palettes:\n    primary:\n      blue: '#1E90FF'\n      red: '#FF4500'\n    neutrals:\n      black: '#000000'\n      white: '#FFFFFF'\n");
        Console.WriteLine("Notes:");
        Console.WriteLine("  - Named colors are loaded from colors.yml (flattened and matched case-insensitively).");
        Console.WriteLine("  - Hex values are parsed with ColorTranslator.FromHtml and are forgiving (invalid hex will be ignored).\n");
    }
}
