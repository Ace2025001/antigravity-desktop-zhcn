Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$data = $env:AGY_PICKER_DATA | ConvertFrom-Json
$selected = $null
if (@($data.options).Count -gt 1) {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = '选择 Antigravity Desktop'
    $form.Width = 760; $form.Height = 320; $form.StartPosition = 'CenterScreen'
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $data.message; $label.SetBounds(15,15,710,45)
    $list = New-Object System.Windows.Forms.ListBox
    $list.SetBounds(15,65,710,150); $list.HorizontalScrollbar = $true
    foreach ($value in $data.options) { [void]$list.Items.Add([string]$value) }
    $list.SelectedIndex = 0
    $ok = New-Object System.Windows.Forms.Button
    $ok.Text = '使用所选'; $ok.SetBounds(410,230,100,30); $ok.DialogResult = 'OK'
    $browse = New-Object System.Windows.Forms.Button
    $browse.Text = '其他位置'; $browse.SetBounds(520,230,100,30); $browse.DialogResult = 'Retry'
    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = '取消'; $cancel.SetBounds(630,230,90,30); $cancel.DialogResult = 'Cancel'
    $form.Controls.AddRange(@($label,$list,$ok,$browse,$cancel)); $form.AcceptButton=$ok; $form.CancelButton=$cancel
    $result = $form.ShowDialog()
    if ($result -eq 'OK') { $selected = [string]$list.SelectedItem }
    $form.Dispose()
    if ($result -eq 'Cancel') { exit 0 }
}
if (-not $selected) {
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = $data.message
    $dialog.Filter = 'Antigravity 程序 (*.exe)|*.exe'
    $dialog.CheckFileExists = $true
    if ($dialog.ShowDialog() -eq 'OK') { $selected = $dialog.FileName }
    $dialog.Dispose()
}
if ($selected) { [Console]::Write($selected) }
