param(
    [ValidateSet('Snapshot', 'Probe', 'ApiProbe', 'FastProbe', 'CaseProbe', 'OpenCase', 'StateReport', 'CapturePosition', 'RunFixture', 'ConsoleCatalog', 'ConsoleUI')]
    [string]$Mode = 'Snapshot',
    [string[]]$Commands = @(),
    [ValidateSet('', 'CREATE', 'MODIFY', 'CONSTRUCT', 'INSPECT', 'INSERT', 'ASSEMBLY')]
    [string]$ManifestGroup = '',
    [ValidateSet('', 'SOLID_CORE', 'ASSEMBLY_CORE')]
    [string]$CaseGroup = '',
    [switch]$NewDocument,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '_fusion_captures'),
    [int]$WaitMilliseconds = 1400
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Fusion's embedded Python process has its own working directory.  Always
# hand it an absolute capture path; otherwise API probes can open correctly
# but fail when writing their JSON result beside a relative output directory.
if (-not (Test-Path -LiteralPath $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
}
$OutputDirectory = (Resolve-Path -LiteralPath $OutputDirectory).Path

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FusionAuditNative {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
'@

function Get-FusionProcess {
    # Prefer the known process handle.  RootElement.FindAll can throw while
    # Windows is rebuilding a Qt system menu, despite Fusion being healthy.
    $process = Get-Process -Name 'Fusion360' -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } |
        Select-Object -First 1
    if ($process) {
        return [pscustomobject]@{
            Id = $process.Id
            MainWindowHandle = [IntPtr]$process.MainWindowHandle
            MainWindowTitle = $process.MainWindowTitle
        }
    }
    throw 'Autodesk Fusion main window not found. Open Fusion 360 first.'
}

function Get-SafeProperty {
    param(
        [System.Windows.Automation.AutomationElement]$Element,
        [string]$PropertyName
    )
    try {
        switch ($PropertyName) {
            'Name' { return $Element.Current.Name }
            'AutomationId' { return $Element.Current.AutomationId }
            'ClassName' { return $Element.Current.ClassName }
            'ControlType' { return $Element.Current.ControlType.ProgrammaticName }
            'IsEnabled' { return $Element.Current.IsEnabled }
            'IsOffscreen' { return $Element.Current.IsOffscreen }
            'BoundingRectangle' {
                $r = $Element.Current.BoundingRectangle
                return [ordered]@{ left = $r.Left; top = $r.Top; width = $r.Width; height = $r.Height }
            }
        }
    } catch {
        return $null
    }
}

function Get-ElementMetadata {
    param([System.Windows.Automation.AutomationElement]$Element)

    return [ordered]@{
        name = Get-SafeProperty $Element 'Name'
        automationId = Get-SafeProperty $Element 'AutomationId'
        className = Get-SafeProperty $Element 'ClassName'
        controlType = Get-SafeProperty $Element 'ControlType'
        isEnabled = Get-SafeProperty $Element 'IsEnabled'
        isOffscreen = Get-SafeProperty $Element 'IsOffscreen'
        bounds = Get-SafeProperty $Element 'BoundingRectangle'
    }
}

function Get-FusionElements {
    param([object]$Process)

    $window = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$Process.MainWindowHandle)
    if (-not $window) { throw 'Fusion main window automation element is unavailable.' }
    return $window.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
    )
}

function Save-FusionScreenshot {
    param(
        [object]$Process,
        [string]$Path
    )

    $r = New-Object FusionAuditNative+RECT
    if (-not [FusionAuditNative]::GetWindowRect([IntPtr]$Process.MainWindowHandle, [ref]$r)) {
        throw 'Unable to read Fusion window bounds.'
    }
    $width = $r.Right - $r.Left
    $height = $r.Bottom - $r.Top
    if ($width -le 0 -or $height -le 0) {
        throw 'Fusion window bounds are invalid; the window may be minimized.'
    }

    $bitmap = New-Object System.Drawing.Bitmap([int]$width, [int]$height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen(
            [int]$r.Left,
            [int]$r.Top,
            0,
            0,
            $bitmap.Size,
            [System.Drawing.CopyPixelOperation]::SourceCopy
        )
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function ConvertTo-SafeFileName {
    param([string]$Value)
    $safe = $Value -replace '[^a-zA-Z0-9_-]+', '-'
    return $safe.Trim('-').ToLowerInvariant()
}

function ConvertTo-SendKeysText {
    param([string]$Value)
    $builder = New-Object System.Text.StringBuilder
    foreach ($character in $Value.ToCharArray()) {
        if ('+^%~(){}[]'.Contains([string]$character)) {
            [void]$builder.Append('{').Append($character).Append('}')
        } else {
            [void]$builder.Append($character)
        }
    }
    return $builder.ToString()
}

function Set-FusionForeground {
    param([object]$Process)
    try {
        $shell = New-Object -ComObject WScript.Shell
        [void]$shell.AppActivate([int]$Process.Id)
    } catch {}
    $handle = [IntPtr]$Process.MainWindowHandle
    [void][FusionAuditNative]::ShowWindowAsync($handle, 9)
    [void][FusionAuditNative]::SetWindowPos($handle, [IntPtr](-1), 0, 0, 0, 0, 0x43)
    [void][FusionAuditNative]::BringWindowToTop($handle)
    [void][FusionAuditNative]::SetForegroundWindow($handle)
    [void][FusionAuditNative]::SetWindowPos($handle, [IntPtr](-2), 0, 0, 0, 0, 0x43)
    Start-Sleep -Milliseconds 250
}

function Save-FusionSnapshot {
    param(
        [object]$Process,
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $OutputDirectory)) {
        New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
    }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $safeLabel = ConvertTo-SafeFileName $Label
    $base = Join-Path $OutputDirectory "$stamp-$safeLabel"
    $elements = Get-FusionElements $Process
    $metadata = New-Object System.Collections.Generic.List[object]
    foreach ($element in $elements) {
        $metadata.Add((Get-ElementMetadata $element))
    }

    $snapshot = [ordered]@{
        capturedAt = (Get-Date).ToString('o')
        fusionProcessId = $Process.Id
        fusionWindowTitle = $Process.MainWindowTitle
        label = $Label
        controls = $metadata
    }
    $snapshot | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath "$base.json" -Encoding UTF8
    Save-FusionScreenshot -Process $Process -Path "$base.png"

    [pscustomobject]@{
        Label = $Label
        Json = "$base.json"
        Screenshot = "$base.png"
        ControlCount = $metadata.Count
    }
}

function Get-AutomationElementByIdSuffix {
    param(
        [object]$Process,
        [string]$Suffix
    )
    foreach ($element in (Get-FusionElements $Process)) {
        $id = Get-SafeProperty $element 'AutomationId'
        if ($id -and $id.EndsWith($Suffix, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $element
        }
    }
    return $null
}

function Invoke-Element {
    param([System.Windows.Automation.AutomationElement]$Element)
    $patterns = @(
        [System.Windows.Automation.InvokePattern]::Pattern,
        [System.Windows.Automation.SelectionItemPattern]::Pattern,
        [System.Windows.Automation.TogglePattern]::Pattern
    )
    foreach ($patternId in $patterns) {
        try {
            $pattern = $Element.GetCurrentPattern($patternId)
            if ($pattern -is [System.Windows.Automation.InvokePattern]) { $pattern.Invoke(); return }
            if ($pattern -is [System.Windows.Automation.SelectionItemPattern]) { $pattern.Select(); return }
            if ($pattern -is [System.Windows.Automation.TogglePattern]) { $pattern.Toggle(); return }
        } catch {
            continue
        }
    }
    $Element.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait(' ')
}

function Show-FusionTextCommands {
    param([object]$Process)

    foreach ($element in (Get-FusionElements $Process)) {
        if ((Get-SafeProperty $element 'Name') -eq 'Py') {
            return
        }
    }

    Set-FusionForeground $Process
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
    Start-Sleep -Milliseconds 250
    # Autodesk's documented Windows shortcut for Show/Hide Text Commands.
    # Native key events are used because WinForms SendKeys can be swallowed by the canvas.
    [FusionAuditNative]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
    [FusionAuditNative]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
    [FusionAuditNative]::keybd_event(0x43, 0, 0, [UIntPtr]::Zero)
    [FusionAuditNative]::keybd_event(0x43, 0, 2, [UIntPtr]::Zero)
    [FusionAuditNative]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    [FusionAuditNative]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 700

    $found = $false
    foreach ($element in (Get-FusionElements $Process)) {
        if ((Get-SafeProperty $element 'Name') -eq 'Py') {
            $found = $true
            break
        }
    }
    if (-not $found) {
        throw 'Unable to expand Text Commands through Fusion search.'
    }
}

function Hide-FusionTextCommands {
    param([object]$Process)

    $button = $null
    foreach ($element in (Get-FusionElements $Process)) {
        $id = Get-SafeProperty $element 'AutomationId'
        if ($id -and $id.EndsWith('TextCommands.QTPushButton', [System.StringComparison]::OrdinalIgnoreCase)) {
            $offscreen = Get-SafeProperty $element 'IsOffscreen'
            $bounds = Get-SafeProperty $element 'BoundingRectangle'
            $left = if ($bounds) { [double]$bounds.left } else { [double]::NaN }
            if (-not $offscreen -and $bounds -and -not [double]::IsInfinity($left) -and -not [double]::IsNaN($left)) {
                $button = $element
                break
            }
        }
    }
    if (-not $button) {
        throw 'Visible Text Commands collapse button not found.'
    }
    Invoke-Element $button
    Start-Sleep -Milliseconds 650
}

function Set-ElementText {
    param(
        [System.Windows.Automation.AutomationElement]$Element,
        [string]$Value
    )
    try {
        $pattern = [System.Windows.Automation.ValuePattern]$Element.GetCurrentPattern(
            [System.Windows.Automation.ValuePattern]::Pattern
        )
        $pattern.SetValue($Value)
        return
    } catch {
        $Element.SetFocus()
        [System.Windows.Forms.SendKeys]::SendWait('^a')
        $oldClipboard = $null
        try { $oldClipboard = [System.Windows.Forms.Clipboard]::GetText() } catch {}
        [System.Windows.Forms.Clipboard]::SetText($Value)
        [System.Windows.Forms.SendKeys]::SendWait('^v')
        if ($null -ne $oldClipboard) {
            [System.Windows.Forms.Clipboard]::SetText($oldClipboard)
        }
    }
}

function Get-ElementText {
    param([System.Windows.Automation.AutomationElement]$Element)
    try {
        $pattern = [System.Windows.Automation.ValuePattern]$Element.GetCurrentPattern(
            [System.Windows.Automation.ValuePattern]::Pattern
        )
        return $pattern.Current.Value
    } catch {}
    try {
        $pattern = [System.Windows.Automation.TextPattern]$Element.GetCurrentPattern(
            [System.Windows.Automation.TextPattern]::Pattern
        )
        return $pattern.DocumentRange.GetText(-1)
    } catch {}
    return $Element.Current.Name
}

function Invoke-FusionSearchProbe {
    param(
        [object]$Process,
        [string]$Command
    )

    Set-FusionForeground $Process
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
    Start-Sleep -Milliseconds 250
    [System.Windows.Forms.SendKeys]::SendWait('s')
    Start-Sleep -Milliseconds 400
    [System.Windows.Forms.SendKeys]::SendWait((ConvertTo-SendKeysText $Command))
    Start-Sleep -Milliseconds $WaitMilliseconds
    $search = Save-FusionSnapshot -Process $Process -Label "search-$Command"

    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds $WaitMilliseconds
    $dialog = Save-FusionSnapshot -Process $Process -Label "dialog-$Command"

    [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
    Start-Sleep -Milliseconds 350

    return [pscustomobject]@{ Command = $Command; Search = $search; Dialog = $dialog }
}

function Export-FusionCommandCatalog {
    param([object]$Process)

    Set-FusionForeground $Process
    $pyRadio = $null
    foreach ($element in (Get-FusionElements $Process)) {
        if ((Get-SafeProperty $element 'Name') -eq 'Py') {
            $pyRadio = $element
            break
        }
    }
    if (-not $pyRadio) {
        throw 'The Py option was not found. Expand the TEXT COMMANDS panel first.'
    }
    Invoke-Element $pyRadio
    Start-Sleep -Milliseconds 250

    $commandBox = Get-AutomationElementByIdSuffix -Process $Process -Suffix 'QTTextCommandControl.ctlCommand'
    $resultsBox = Get-AutomationElementByIdSuffix -Process $Process -Suffix 'QTTextCommandControl.ctlResults'
    if (-not $commandBox -or -not $resultsBox) {
        throw 'Text Commands controls were not found. Ensure the panel is expanded.'
    }

    $python = "import adsk.core; app=adsk.core.Application.get(); ui=app.userInterface; print('FUSION_COMMAND_CATALOG_BEGIN'); print(chr(10).join([ui.commandDefinitions.item(i).id+chr(9)+ui.commandDefinitions.item(i).name for i in range(ui.commandDefinitions.count)])); print('FUSION_COMMAND_CATALOG_END')"
    Set-ElementText -Element $commandBox -Value $python
    $commandBox.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds ([Math]::Max(2000, $WaitMilliseconds))

    if (-not (Test-Path -LiteralPath $OutputDirectory)) {
        New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
    }
    $path = Join-Path $OutputDirectory ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-fusion-command-catalog.txt')
    Get-ElementText $resultsBox | Set-Content -LiteralPath $path -Encoding UTF8
    return $path
}

function Export-FusionUiCatalog {
    param([object]$Process)

    Set-FusionForeground $Process
    $pyRadio = $null
    foreach ($element in (Get-FusionElements $Process)) {
        if ((Get-SafeProperty $element 'Name') -eq 'Py') {
            $pyRadio = $element
            break
        }
    }
    if (-not $pyRadio) {
        throw 'The Py option was not found. Expand the TEXT COMMANDS panel first.'
    }
    Invoke-Element $pyRadio
    Start-Sleep -Milliseconds 250

    $commandBox = Get-AutomationElementByIdSuffix -Process $Process -Suffix 'QTTextCommandControl.ctlCommand'
    $resultsBox = Get-AutomationElementByIdSuffix -Process $Process -Suffix 'QTTextCommandControl.ctlResults'
    if (-not $commandBox -or -not $resultsBox) {
        throw 'Text Commands controls were not found. Ensure the panel is expanded.'
    }

    $script = @'
import adsk.core, json
app = adsk.core.Application.get()
ui = app.userInterface

def safe(obj, name, default=None):
    try:
        return getattr(obj, name)
    except:
        return default

def control_data(control):
    item = {
        'objectType': safe(control, 'objectType'),
        'id': safe(control, 'id'),
        'index': safe(control, 'index'),
        'name': safe(control, 'name'),
        'isVisible': safe(control, 'isVisible'),
        'isEnabled': safe(control, 'isEnabled'),
        'isPromoted': safe(control, 'isPromoted')
    }
    try:
        cmd = control.commandDefinition
        if cmd:
            item['commandId'] = cmd.id
            item['commandName'] = cmd.name
            item['commandDescription'] = safe(cmd, 'description')
    except:
        pass
    if control.objectType == adsk.core.DropDownControl.classType():
        item['children'] = [control_data(control.controls.item(i)) for i in range(control.controls.count)]
    elif control.objectType == adsk.core.SplitButtonControl.classType():
        try:
            cmd = control.defaultCommandDefinition
            item['defaultCommand'] = {'id': cmd.id, 'name': cmd.name} if cmd else None
        except:
            item['defaultCommand'] = None
        try:
            item['additionalCommands'] = [{'id': cmd.id, 'name': cmd.name} for cmd in control.additionalDefinitions]
        except:
            item['additionalCommands'] = []
    return item

workspace = ui.activeWorkspace
result = {
    'workspace': {'id': workspace.id, 'name': workspace.name} if workspace else None,
    'activeTab': {'id': ui.activeToolbarTab.id, 'name': ui.activeToolbarTab.name} if ui.activeToolbarTab else None,
    'tabs': []
}

if workspace:
    for tab_index in range(workspace.toolbarTabs.count):
        tab = workspace.toolbarTabs.item(tab_index)
        tab_data = {'id': tab.id, 'name': tab.name, 'index': tab_index, 'panels': []}
        for panel_index in range(tab.toolbarPanels.count):
            panel = tab.toolbarPanels.item(panel_index)
            panel_data = {
                'id': panel.id,
                'name': panel.name,
                'index': panel_index,
                'isVisible': safe(panel, 'isVisible'),
                'controls': [control_data(panel.controls.item(i)) for i in range(panel.controls.count)]
            }
            tab_data['panels'].append(panel_data)
        result['tabs'].append(tab_data)
print('FUSION_UI_CATALOG_BEGIN')
print(json.dumps(result, ensure_ascii=False))
print('FUSION_UI_CATALOG_END')
'@
    $python = 'exec(' + ($script | ConvertTo-Json -Compress) + ')'
    Set-ElementText -Element $commandBox -Value $python
    $commandBox.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds ([Math]::Max(3000, $WaitMilliseconds))

    if (-not (Test-Path -LiteralPath $OutputDirectory)) {
        New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
    }
    $path = Join-Path $OutputDirectory ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-fusion-ui-catalog.txt')
    Get-ElementText $resultsBox | Set-Content -LiteralPath $path -Encoding UTF8
    return $path
}

function Invoke-FusionApiProbe {
    param(
        [object]$Process,
        [string]$CommandId
    )

    Set-FusionForeground $Process
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
    Start-Sleep -Milliseconds 300

    $pyRadio = $null
    foreach ($element in (Get-FusionElements $Process)) {
        if ((Get-SafeProperty $element 'Name') -eq 'Py') {
            $pyRadio = $element
            break
        }
    }
    if (-not $pyRadio) {
        throw 'The Py option was not found. Expand the TEXT COMMANDS panel first.'
    }
    Invoke-Element $pyRadio
    Start-Sleep -Milliseconds 200

    $commandBox = Get-AutomationElementByIdSuffix -Process $Process -Suffix 'QTTextCommandControl.ctlCommand'
    if (-not $commandBox) {
        throw 'The Text Commands input control was not found.'
    }
    if (-not (Test-Path -LiteralPath $OutputDirectory)) {
        New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
    }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $safeCommand = ConvertTo-SafeFileName $CommandId
    $resultPath = Join-Path $OutputDirectory "$stamp-api-$safeCommand-inputs.json"
    $commandLiteral = $CommandId | ConvertTo-Json -Compress
    $pathLiteral = $resultPath | ConvertTo-Json -Compress

    $script = @'
import adsk.core, json, os, traceback
app = adsk.core.Application.get()
ui = app.userInterface
command_id = __COMMAND_ID__
result_path = __RESULT_PATH__

def simple(value):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    try:
        return list(value)
    except:
        pass
    try:
        return value.name
    except:
        return str(value)

def prop(obj, name):
    try:
        return simple(getattr(obj, name))
    except:
        return None

def inputs_data(inputs):
    output = []
    if not inputs:
        return output
    for index in range(inputs.count):
        item = inputs.item(index)
        row = {'index': index}
        for name in [
            'id', 'name', 'objectType', 'isVisible', 'isEnabled', 'isFullWidth',
            'tooltip', 'tooltipDescription', 'expression', 'value', 'unitType',
            'minimumValue', 'maximumValue', 'spinStep', 'hasFocus',
            'minimumSelectionCount', 'maximumSelectionCount', 'selectionFilters'
        ]:
            value = prop(item, name)
            if value is not None:
                row[name] = value
        try:
            list_items = item.listItems
            row['listItems'] = []
            for list_index in range(list_items.count):
                list_item = list_items.item(list_index)
                row['listItems'].append({
                    'index': list_index,
                    'name': prop(list_item, 'name'),
                    'isSelected': prop(list_item, 'isSelected'),
                    'icon': prop(list_item, 'icon')
                })
        except:
            pass
        try:
            row['children'] = inputs_data(item.children)
        except:
            pass
        output.append(row)
    return output

class AuditCommandCreatedHandler(adsk.core.CommandCreatedEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            command = args.command
            record = {
                'commandId': command_id,
                'eventFired': True,
                'dialog': {
                    'isOKButtonVisible': prop(command, 'isOKButtonVisible'),
                    'isCancelButtonVisible': prop(command, 'isCancelButtonVisible'),
                    'isExecutedWhenPreEmpted': prop(command, 'isExecutedWhenPreEmpted'),
                    'helpFile': prop(command, 'helpFile')
                },
                'inputs': inputs_data(command.commandInputs)
            }
            with open(result_path, 'w', encoding='utf-8') as stream:
                json.dump(record, stream, ensure_ascii=False, indent=2)
        except:
            with open(result_path, 'w', encoding='utf-8') as stream:
                json.dump({'commandId': command_id, 'eventFired': True, 'error': traceback.format_exc()}, stream, indent=2)

definition = ui.commandDefinitions.itemById(command_id)
if not definition:
    with open(result_path, 'w', encoding='utf-8') as stream:
        json.dump({'commandId': command_id, 'eventFired': False, 'error': 'command definition not found'}, stream, indent=2)
else:
    handler = AuditCommandCreatedHandler()
    if '_fusion_audit_handlers' not in globals():
        _fusion_audit_handlers = []
    _fusion_audit_handlers.append(handler)
    definition.commandCreated.add(handler)
    executed = definition.execute()
    if not os.path.exists(result_path):
        with open(result_path, 'w', encoding='utf-8') as stream:
            json.dump({'commandId': command_id, 'eventFired': False, 'executeReturned': executed}, stream, indent=2)
'@
    $script = $script.Replace('__COMMAND_ID__', $commandLiteral).Replace('__RESULT_PATH__', $pathLiteral)
    $python = 'exec(' + ($script | ConvertTo-Json -Compress) + ')'
    Set-ElementText -Element $commandBox -Value $python
    $commandBox.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds ([Math]::Max(1800, $WaitMilliseconds))

    $snapshot = Save-FusionSnapshot -Process $Process -Label "api-dialog-$CommandId"
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
    Start-Sleep -Milliseconds 350

    return [pscustomobject]@{
        CommandId = $CommandId
        InputJson = $resultPath
        InputJsonExists = Test-Path -LiteralPath $resultPath
        Snapshot = $snapshot
    }
}

function Invoke-FusionFastProbeBatch {
    param(
        [object]$Process,
        [string[]]$CommandIds
    )

    Set-FusionForeground $Process
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
    Start-Sleep -Milliseconds 300

    $pyRadio = $null
    foreach ($element in (Get-FusionElements $Process)) {
        if ((Get-SafeProperty $element 'Name') -eq 'Py') {
            $pyRadio = $element
            break
        }
    }
    if (-not $pyRadio) {
        throw 'The Py option was not found. Expand the TEXT COMMANDS panel first.'
    }
    Invoke-Element $pyRadio
    Start-Sleep -Milliseconds 200

    $commandBox = Get-AutomationElementByIdSuffix -Process $Process -Suffix 'QTTextCommandControl.ctlCommand'
    if (-not $commandBox) {
        throw 'The Text Commands input control was not found.'
    }

    $batchStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $batchDirectory = Join-Path $OutputDirectory "$batchStamp-fast-probe"
    New-Item -ItemType Directory -Path $batchDirectory -Force | Out-Null
    $records = New-Object System.Collections.Generic.List[object]

    foreach ($commandId in $CommandIds) {
        Set-FusionForeground $Process
        [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
        Start-Sleep -Milliseconds 220

        $safeCommand = ConvertTo-SafeFileName $commandId
        $statusPath = Join-Path $batchDirectory "$safeCommand-status.json"
        $screenshotPath = Join-Path $batchDirectory "$safeCommand.png"
        $commandLiteral = $commandId | ConvertTo-Json -Compress
        $pathLiteral = $statusPath | ConvertTo-Json -Compress
        $python = "import adsk.core,json; ui=adsk.core.Application.get().userInterface; cid=$commandLiteral; p=$pathLiteral; d=ui.commandDefinitions.itemById(cid); ok=d.execute() if d else False; open(p,'w',encoding='utf-8').write(json.dumps({'commandId':cid,'executeReturned':ok}))"

        Set-ElementText -Element $commandBox -Value $python
        $commandBox.SetFocus()
        [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
        Start-Sleep -Milliseconds ([Math]::Max(900, $WaitMilliseconds))
        Save-FusionScreenshot -Process $Process -Path $screenshotPath
        [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
        Start-Sleep -Milliseconds 320

        $records.Add([ordered]@{
            commandId = $commandId
            screenshot = $screenshotPath
            status = $statusPath
            statusExists = Test-Path -LiteralPath $statusPath
        })
        Write-Output ("captured " + $commandId)
    }

    $indexPath = Join-Path $batchDirectory 'index.json'
    $records | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $indexPath -Encoding UTF8
    return $indexPath
}

function Invoke-FusionFixture {
    param(
        [object]$Process,
        [switch]$CreateNewDocument,
        [string]$FixtureFile = '_fusion_fixture.py'
    )

    Set-FusionForeground $Process
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
    Start-Sleep -Milliseconds 250

    if (-not (Test-Path -LiteralPath $OutputDirectory)) {
        New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    }

    $pyRadio = $null
    foreach ($element in (Get-FusionElements $Process)) {
        if ((Get-SafeProperty $element 'Name') -eq 'Py') {
            $pyRadio = $element
            break
        }
    }
    if (-not $pyRadio) {
        throw 'The Py option was not found. Expand the TEXT COMMANDS panel first.'
    }
    Invoke-Element $pyRadio
    Start-Sleep -Milliseconds 200

    $commandBox = Get-AutomationElementByIdSuffix -Process $Process -Suffix 'QTTextCommandControl.ctlCommand'
    $resultsBox = Get-AutomationElementByIdSuffix -Process $Process -Suffix 'QTTextCommandControl.ctlResults'
    if (-not $commandBox -or -not $resultsBox) {
        throw 'Text Commands controls were not found.'
    }

    $fixturePath = Join-Path $PSScriptRoot $FixtureFile
    $script = [System.IO.File]::ReadAllText($fixturePath, [System.Text.Encoding]::UTF8)
    if ($CreateNewDocument) {
        $script = "import adsk.core`n_adsk_app = adsk.core.Application.get()`n_adsk_app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)`n" + $script
    }
    $quotedScript = ConvertTo-Json -InputObject ([string]$script) -Compress
    $python = 'exec(' + $quotedScript + ')'
    Set-ElementText -Element $commandBox -Value $python
    $commandBox.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds 8000

    $resultsPath = Join-Path $OutputDirectory ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-fixture-console.txt')
    Get-ElementText $resultsBox | Set-Content -LiteralPath $resultsPath -Encoding UTF8
    $snapshot = Save-FusionSnapshot -Process $Process -Label 'fusion-fixture'
    return [pscustomobject]@{ Console = $resultsPath; Snapshot = $snapshot }
}

function Invoke-FusionCaseProbeBatch {
    param(
        [object]$Process,
        [string[]]$CaseIds
    )

    Set-FusionForeground $Process
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
    Start-Sleep -Milliseconds 300

    $pyRadio = $null
    foreach ($element in (Get-FusionElements $Process)) {
        if ((Get-SafeProperty $element 'Name') -eq 'Py') {
            $pyRadio = $element
            break
        }
    }
    if (-not $pyRadio) {
        throw 'The Py option was not found.'
    }
    Invoke-Element $pyRadio
    Start-Sleep -Milliseconds 200

    $commandBox = Get-AutomationElementByIdSuffix -Process $Process -Suffix 'QTTextCommandControl.ctlCommand'
    if (-not $commandBox) {
        throw 'The Text Commands input control was not found.'
    }

    $templatePath = Join-Path $PSScriptRoot '_fusion_cases.py'
    $template = [System.IO.File]::ReadAllText($templatePath, [System.Text.Encoding]::UTF8)
    $batchStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $batchDirectory = Join-Path $OutputDirectory "$batchStamp-case-probe"
    New-Item -ItemType Directory -Path $batchDirectory -Force | Out-Null
    $records = New-Object System.Collections.Generic.List[object]

    foreach ($caseId in $CaseIds) {
        Set-FusionForeground $Process
        [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
        Start-Sleep -Milliseconds 250

        $safeCase = ConvertTo-SafeFileName $caseId
        $statusPath = Join-Path $batchDirectory "$safeCase-status.json"
        $screenshotPath = Join-Path $batchDirectory "$safeCase.png"
        $caseLiteral = ConvertTo-Json -InputObject ([string]$caseId) -Compress
        $pathLiteral = ConvertTo-Json -InputObject ([string]$statusPath) -Compress
        $script = $template.Replace('__CASE_ID__', $caseLiteral).Replace('__RESULT_PATH__', $pathLiteral)
        $quotedScript = ConvertTo-Json -InputObject ([string]$script) -Compress
        $python = 'exec(' + $quotedScript + ')'

        try {
            Set-ElementText -Element $commandBox -Value $python
        } catch {
            $commandBox = Get-AutomationElementByIdSuffix -Process $Process -Suffix 'QTTextCommandControl.ctlCommand'
            if (-not $commandBox) { throw }
            Set-ElementText -Element $commandBox -Value $python
        }
        $commandBox.SetFocus()
        [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
        Start-Sleep -Milliseconds ([Math]::Max(1200, $WaitMilliseconds))
        Save-FusionScreenshot -Process $Process -Path $screenshotPath
        [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
        Start-Sleep -Milliseconds 350

        $records.Add([ordered]@{
            caseId = $caseId
            screenshot = $screenshotPath
            status = $statusPath
            statusExists = Test-Path -LiteralPath $statusPath
        })
        Write-Output ("captured case " + $caseId)
    }

    $indexPath = Join-Path $batchDirectory 'index.json'
    $records | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $indexPath -Encoding UTF8
    return $indexPath
}

function Open-FusionInteractionCase {
    param(
        [object]$Process,
        [string]$CaseId
    )

    Set-FusionForeground $Process
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
    Start-Sleep -Milliseconds 300
    Show-FusionTextCommands -Process $Process

    $pyRadio = $null
    foreach ($element in (Get-FusionElements $Process)) {
        if ((Get-SafeProperty $element 'Name') -eq 'Py') {
            $pyRadio = $element
            break
        }
    }
    if (-not $pyRadio) {
        throw 'The Py option was not found.'
    }
    Invoke-Element $pyRadio
    Start-Sleep -Milliseconds 200

    $commandBox = Get-AutomationElementByIdSuffix -Process $Process -Suffix 'QTTextCommandControl.ctlCommand'
    if (-not $commandBox) {
        throw 'The Text Commands input control was not found.'
    }

    $templatePath = Join-Path $PSScriptRoot '_fusion_cases.py'
    $template = [System.IO.File]::ReadAllText($templatePath, [System.Text.Encoding]::UTF8)
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $caseDirectory = Join-Path $OutputDirectory "$stamp-open-case"
    New-Item -ItemType Directory -Path $caseDirectory -Force | Out-Null
    $safeCase = ConvertTo-SafeFileName $CaseId
    $statusPath = Join-Path $caseDirectory "$safeCase-status.json"
    $caseLiteral = ConvertTo-Json -InputObject ([string]$CaseId) -Compress
    $pathLiteral = ConvertTo-Json -InputObject ([string]$statusPath) -Compress
    $script = $template.Replace('__CASE_ID__', $caseLiteral).Replace('__RESULT_PATH__', $pathLiteral)
    $quotedScript = ConvertTo-Json -InputObject ([string]$script) -Compress
    $python = 'exec(' + $quotedScript + ')'

    Set-ElementText -Element $commandBox -Value $python
    $commandBox.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds ([Math]::Max(1400, $WaitMilliseconds))
    $snapshot = Save-FusionSnapshot -Process $Process -Label "open-case-$CaseId"
    $record = [ordered]@{
        caseId = $CaseId
        status = $statusPath
        statusExists = Test-Path -LiteralPath $statusPath
        screenshot = $snapshot.Screenshot
        ui = $snapshot.Json
        commandLeftOpen = $true
    }
    $recordPath = Join-Path $caseDirectory 'index.json'
    $record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $recordPath -Encoding UTF8
    return $recordPath
}

function Export-FusionStateReport {
    param([object]$Process)

    Set-FusionForeground $Process
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
    Start-Sleep -Milliseconds 250
    Show-FusionTextCommands -Process $Process

    $pyRadio = $null
    foreach ($element in (Get-FusionElements $Process)) {
        if ((Get-SafeProperty $element 'Name') -eq 'Py') {
            $pyRadio = $element
            break
        }
    }
    if (-not $pyRadio) { throw 'The Py option was not found.' }
    Invoke-Element $pyRadio
    Start-Sleep -Milliseconds 180

    $commandBox = Get-AutomationElementByIdSuffix -Process $Process -Suffix 'QTTextCommandControl.ctlCommand'
    if (-not $commandBox) { throw 'The Text Commands input control was not found.' }
    if (-not (Test-Path -LiteralPath $OutputDirectory)) {
        New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    }
    $path = Join-Path $OutputDirectory ((Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-fusion-state.json')
    $pathLiteral = ConvertTo-Json -InputObject ([string]$path) -Compress
    $script = @'
import adsk.core, adsk.fusion, json, traceback
app = adsk.core.Application.get()
ui = app.userInterface
design = adsk.fusion.Design.cast(app.activeProduct)
path = __RESULT_PATH__

def safe(obj, name, default=None):
    try:
        value = getattr(obj, name)
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        try:
            return value.name
        except:
            return str(value)
    except:
        return default

def point_data(point):
    return {'x': point.x, 'y': point.y, 'z': point.z}

result = {
    'document': {
        'name': app.activeDocument.name if app.activeDocument else None,
        'isSaved': safe(app.activeDocument, 'isSaved') if app.activeDocument else None,
    },
    'selectionCount': ui.activeSelections.count,
}

if design:
    root = design.rootComponent
    bodies = []
    for body in root.bRepBodies:
        box = body.boundingBox
        bodies.append({
            'name': body.name,
            'isSolid': safe(body, 'isSolid'),
            'isVisible': safe(body, 'isVisible'),
            'volumeCm3': safe(body, 'volume'),
            'areaCm2': safe(body, 'area'),
            'minPointCm': point_data(box.minPoint),
            'maxPointCm': point_data(box.maxPoint),
        })
    features = []
    for feature in root.features:
        feature_row = {
            'name': safe(feature, 'name'),
            'objectType': safe(feature, 'objectType'),
            'isSuppressed': safe(feature, 'isSuppressed'),
            'healthState': safe(feature, 'healthState'),
            'errorOrWarningMessage': safe(feature, 'errorOrWarningMessage'),
        }
        if safe(feature, 'objectType') == 'adsk::fusion::ShellFeature':
            shell_details = {}
            for parameter_name in ['insideThickness', 'outsideThickness']:
                try:
                    parameter = getattr(feature, parameter_name)
                    shell_details[parameter_name] = {
                        'expression': safe(parameter, 'expression'),
                        'valueCm': safe(parameter, 'value'),
                    }
                except:
                    pass
            for property_name in ['shellType', 'direction']:
                value = safe(feature, property_name)
                if value is not None:
                    shell_details[property_name] = value
            feature_row['shell'] = shell_details
        if safe(feature, 'objectType') == 'adsk::fusion::MoveFeature':
            try:
                transform = feature.transform
                translation = transform.translation
                feature_row['move'] = {
                    'translationCm': {
                        'x': translation.x,
                        'y': translation.y,
                        'z': translation.z,
                    },
                    'bodyCount': feature.bodies.count,
                }
            except:
                pass
        features.append(feature_row)
    timeline = []
    for index in range(design.timeline.count):
        item = design.timeline.item(index)
        entity = safe(item, 'entity')
        timeline.append({
            'index': index,
            'name': safe(item, 'name'),
            'objectType': safe(item, 'objectType'),
            'entity': entity,
            'isGroup': safe(item, 'isGroup'),
        })
    occurrences = []
    for occurrence in root.occurrences:
        transform = occurrence.transform2
        translation = transform.translation
        occurrences.append({
            'name': occurrence.name,
            'component': occurrence.component.name,
            'isGrounded': safe(occurrence, 'isGrounded'),
            'translationCm': {'x': translation.x, 'y': translation.y, 'z': translation.z},
        })

    construction_planes = []
    for construction_plane in root.constructionPlanes:
        definition = safe(construction_plane, 'definition')
        row = {
            'name': safe(construction_plane, 'name'),
            'objectType': safe(construction_plane, 'objectType'),
            'isVisible': safe(construction_plane, 'isVisible'),
            'healthState': safe(construction_plane, 'healthState'),
            'errorOrWarningMessage': safe(construction_plane, 'errorOrWarningMessage'),
            'definitionObjectType': safe(definition, 'objectType'),
        }
        for property_name in ['offset', 'distance', 'angle']:
            try:
                value = getattr(definition, property_name)
                row[property_name] = {
                    'objectType': safe(value, 'objectType'),
                    'expression': safe(value, 'expression'),
                    'value': safe(value, 'value'),
                }
            except:
                pass
        construction_planes.append(row)

    parameters = []
    try:
        for parameter in design.allParameters:
            created_by = safe(parameter, 'createdBy')
            parameters.append({
                'name': safe(parameter, 'name'),
                'objectType': safe(parameter, 'objectType'),
                'expression': safe(parameter, 'expression'),
                'value': safe(parameter, 'value'),
                'unit': safe(parameter, 'unit'),
                'role': safe(parameter, 'role'),
                'createdBy': created_by,
            })
    except:
        pass

    analyses = []
    try:
        for analysis in design.analyses:
            row = {
                'name': safe(analysis, 'name'),
                'objectType': safe(analysis, 'objectType'),
                'isVisible': safe(analysis, 'isVisible'),
            }
            for property_name in ['showHatch', 'sectionColor']:
                try:
                    value = getattr(analysis, property_name)
                    if property_name == 'sectionColor':
                        row[property_name] = {
                            'red': safe(value, 'red'),
                            'green': safe(value, 'green'),
                            'blue': safe(value, 'blue'),
                            'opacity': safe(value, 'opacity'),
                        }
                    else:
                        row[property_name] = value
                except:
                    pass
            analyses.append(row)
    except:
        pass

    def collection_count(owner, name):
        try:
            return getattr(owner, name).count
        except:
            return None

    result['design'] = {
        'designType': safe(design, 'designType'),
        'rootBodyCount': root.bRepBodies.count,
        'rootSketchCount': root.sketches.count,
        'rootOccurrenceCount': root.occurrences.count,
        'jointCount': collection_count(root, 'joints'),
        'asBuiltJointCount': collection_count(root, 'asBuiltJoints'),
        'rigidGroupCount': collection_count(root, 'rigidGroups'),
        'snapshotCount': collection_count(design, 'snapshots'),
        'rootFeatureCount': root.features.count,
        'timelineCount': design.timeline.count,
        'timelineMarkerPosition': design.timeline.markerPosition,
        'bodies': bodies,
        'features': features,
        'timeline': timeline,
        'occurrences': occurrences,
        'constructionPlaneCount': root.constructionPlanes.count,
        'constructionPlanes': construction_planes,
        'parameters': parameters,
        'analysisCount': len(analyses),
        'analyses': analyses,
    }
else:
    result['error'] = 'active product is not a Fusion Design'

with open(path, 'w', encoding='utf-8') as stream:
    json.dump(result, stream, ensure_ascii=False, indent=2)
'@
    $script = $script.Replace('__RESULT_PATH__', $pathLiteral)
    $python = 'exec(' + (ConvertTo-Json -InputObject ([string]$script) -Compress) + ')'
    Set-ElementText -Element $commandBox -Value $python
    $commandBox.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds ([Math]::Max(1200, $WaitMilliseconds))
    if (-not (Test-Path -LiteralPath $path)) {
        throw 'Fusion state report was not created.'
    }
    Hide-FusionTextCommands -Process $Process
    return $path
}

function Invoke-FusionCapturePosition {
    param([object]$Process)

    Set-FusionForeground $Process
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
    Start-Sleep -Milliseconds 250
    Show-FusionTextCommands -Process $Process

    $pyRadio = $null
    foreach ($element in (Get-FusionElements $Process)) {
        if ((Get-SafeProperty $element 'Name') -eq 'Py') {
            $pyRadio = $element
            break
        }
    }
    if (-not $pyRadio) { throw 'The Py option was not found.' }
    Invoke-Element $pyRadio
    Start-Sleep -Milliseconds 180

    $commandBox = Get-AutomationElementByIdSuffix -Process $Process -Suffix 'QTTextCommandControl.ctlCommand'
    if (-not $commandBox) { throw 'The Text Commands input control was not found.' }
    $python = "import adsk.core, adsk.fusion; d=adsk.fusion.Design.cast(adsk.core.Application.get().activeProduct); d.snapshots.add()"
    Set-ElementText -Element $commandBox -Value $python
    $commandBox.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds ([Math]::Max(1200, $WaitMilliseconds))
    Hide-FusionTextCommands -Process $Process
    return 'Fusion component positions captured.'
}

$fusion = Get-FusionProcess
switch ($Mode) {
    'Snapshot' {
        Set-FusionForeground $fusion
        Save-FusionSnapshot -Process $fusion -Label 'fusion-ui' | Format-List
    }
    'Probe' {
        if ($Commands.Count -eq 0) {
            throw 'Probe mode requires -Commands, for example: -Commands Extrude,Fillet'
        }
        foreach ($command in $Commands) {
            Invoke-FusionSearchProbe -Process $fusion -Command $command | Format-List
        }
    }
    'ApiProbe' {
        $commandIds = $Commands
        if ($commandIds.Count -eq 0 -and $ManifestGroup) {
            $manifestPath = Join-Path $PSScriptRoot '_fusion_probe_manifest.json'
            $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $commandIds = $manifest.groups.$ManifestGroup.commands
        }
        if ($commandIds.Count -eq 0) {
            throw 'ApiProbe mode requires -Commands or -ManifestGroup.'
        }
        foreach ($command in $commandIds) {
            Invoke-FusionApiProbe -Process $fusion -CommandId $command | Format-List
        }
    }
    'FastProbe' {
        $commandIds = $Commands
        if ($commandIds.Count -eq 0 -and $ManifestGroup) {
            $manifestPath = Join-Path $PSScriptRoot '_fusion_probe_manifest.json'
            $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $commandIds = $manifest.groups.$ManifestGroup.commands
        }
        if ($commandIds.Count -eq 0) {
            throw 'FastProbe mode requires -Commands or -ManifestGroup.'
        }
        Invoke-FusionFastProbeBatch -Process $fusion -CommandIds $commandIds
    }
    'RunFixture' {
        $fixtureFile = if ($Commands.Count -eq 1 -and $Commands[0] -eq 'Assembly') {
            '_fusion_assembly_fixture.py'
        } else {
            '_fusion_fixture.py'
        }
        Invoke-FusionFixture -Process $fusion -CreateNewDocument:$NewDocument -FixtureFile $fixtureFile | Format-List
    }
    'CaseProbe' {
        if (-not $CaseGroup) {
            throw 'CaseProbe mode requires -CaseGroup.'
        }
        $manifestPath = Join-Path $PSScriptRoot '_fusion_interaction_manifest.json'
        $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $caseIds = $manifest.groups.$CaseGroup
        Invoke-FusionCaseProbeBatch -Process $fusion -CaseIds $caseIds
    }
    'OpenCase' {
        if ($Commands.Count -ne 1) {
            throw 'OpenCase mode requires exactly one interaction case id in -Commands.'
        }
        Open-FusionInteractionCase -Process $fusion -CaseId $Commands[0]
    }
    'StateReport' {
        Export-FusionStateReport -Process $fusion
    }
    'CapturePosition' {
        Invoke-FusionCapturePosition -Process $fusion
    }
    'ConsoleCatalog' {
        Export-FusionCommandCatalog -Process $fusion
    }
    'ConsoleUI' {
        Export-FusionUiCatalog -Process $fusion
    }
}
