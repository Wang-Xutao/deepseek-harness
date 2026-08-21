!macro customHeader
  ; 默认折叠详情，用户点击「显示详细信息」再展开；卸载不显示详情框
  ShowInstDetails hide
  ShowUnInstDetails nevershow
!macroend

!macro customInit
  SetDetailsPrint both
  DetailPrint "========================================"
  DetailPrint "baf-dsh 安装程序"
  DetailPrint "========================================"
  DetailPrint "[准备] 安装向导已启动"
  DetailPrint "[准备] 安装目录: $INSTDIR"
  DetailPrint "[准备] 阶段规划: 释放文件 → Node 检测 → 解压运行时 → 校验 → 收尾"
  DetailPrint "[提示] 完整日志将写入: $INSTDIR\install-steps.log"
!macroend

!macro customUnInit
  SetDetailsPrint none
!macroend

; 在进度条 / InstFiles 开始前写入详情（展开「显示详细信息」可见历史）
!macro customCheckAppRunning
  SetDetailsPrint both
  DetailPrint "----------------------------------------"
  DetailPrint "[准备] 即将开始释放安装文件"
  DetailPrint "  · 主程序 baf-dsh.exe"
  DetailPrint "  · 应用包 resources/app.asar"
  DetailPrint "  · 运行时 resources/dsh/modules.zip"
  DetailPrint "  · Node 检测脚本与安装包"
  DetailPrint "  · 图标与卸载程序"
  DetailPrint "[准备] 进入文件释放阶段..."
!macroend

Function .onInstFiles
  SetDetailsPrint both
  CreateDirectory "$INSTDIR"
  FileOpen $R9 "$INSTDIR\install-steps.log" w
  FileWrite $R9 "baf-dsh 安装日志$\r$\n"
  FileWrite $R9 "安装目录: $INSTDIR$\r$\n"
  FileWrite $R9 "========================================$\r$\n"
  FileWrite $R9 "[阶段 1/5] 开始释放文件$\r$\n"
  FileClose $R9
  DetailPrint "----------------------------------------"
  DetailPrint "[阶段 1/5] 正在释放安装文件..."
  DetailPrint "  目标目录: $INSTDIR"
  DetailPrint "  · 写入 baf-dsh.exe"
  DetailPrint "  · 写入 resources/app.asar"
  DetailPrint "  · 写入 resources/dsh/modules.zip"
  DetailPrint "  · 写入 resources/installer/check-node.ps1"
  DetailPrint "  · 写入 resources/node-installer/node-v22.19.0-x64.msi"
  DetailPrint "  · 写入 resources/icon.ico"
  DetailPrint "  · 写入卸载程序与快捷方式"
  DetailPrint "[阶段 1/5] 文件释放进行中，请稍候..."
  DetailPrint "  日志文件: $INSTDIR\install-steps.log"
FunctionEnd

!macro VerifyFile path desc
  ${If} ${FileExists} "${path}"
    DetailPrint "  [OK] ${desc}"
    DetailPrint "      路径: ${path}"
    FileWrite $R9 "  [OK] ${desc} -> ${path}$\r$\n"
  ${Else}
    DetailPrint "  [缺失] ${desc}"
    DetailPrint "      路径: ${path}"
    FileWrite $R9 "  [MISS] ${desc} -> ${path}$\r$\n"
  ${EndIf}
!macroend

!macro customInstall
  SetDetailsPrint both

  FileOpen $R9 "$INSTDIR\install-steps.log" a
  FileWrite $R9 "----------------------------------------$\r$\n"

  DetailPrint "----------------------------------------"
  DetailPrint "[阶段 1/5] 安装文件释放完成，正在校验..."
  FileWrite $R9 "[阶段 1/5] 文件校验$\r$\n"
  !insertmacro VerifyFile "$INSTDIR\baf-dsh.exe" "主程序"
  !insertmacro VerifyFile "$INSTDIR\resources\app.asar" "应用包 app.asar"
  !insertmacro VerifyFile "$INSTDIR\resources\dsh\modules.zip" "运行时 modules.zip"
  !insertmacro VerifyFile "$INSTDIR\resources\installer\check-node.ps1" "Node 检测脚本"
  !insertmacro VerifyFile "$INSTDIR\resources\node-installer\node-v22.19.0-x64.msi" "Node 安装包"
  !insertmacro VerifyFile "$INSTDIR\resources\icon.ico" "应用图标"

  DetailPrint "----------------------------------------"
  DetailPrint "[阶段 2/5] 检查 Node.js 运行环境"
  DetailPrint "  要求版本: 22.19+ 或 24+"
  DetailPrint "  步骤 2.1: 调用检测脚本 check-node.ps1"
  FileWrite $R9 "[阶段 2/5] Node.js 检查$\r$\n"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\installer\check-node.ps1"'
  Pop $R0
  Pop $R1
  DetailPrint "  步骤 2.2: 解析检测结果"
  DetailPrint "  检测脚本退出码: $R0"
  DetailPrint "  检测输出: $R1"
  FileWrite $R9 "  exit=$R0 output=$R1$\r$\n"

  ${If} $R0 == "2"
    DetailPrint "  步骤 2.3: 本机无可用 Node，准备静默安装"
    DetailPrint "[阶段 2/5] 未找到合适 Node，开始静默安装 22.19.0..."
    DetailPrint "  安装包: node-v22.19.0-x64.msi"
    DetailPrint "  方式: msiexec /qn /norestart ALLUSERS=1"
    FileWrite $R9 "[阶段 2/5] 安装 Node MSI$\r$\n"
    ExecWait '"$SYSDIR\msiexec.exe" /i "$INSTDIR\resources\node-installer\node-v22.19.0-x64.msi" /qn /norestart ALLUSERS=1' $R2
    DetailPrint "  msiexec 退出码: $R2"
    FileWrite $R9 "  msiexec exit=$R2$\r$\n"
    ${If} $R2 != 0
      FileClose $R9
      MessageBox MB_OK "Node.js 安装失败（退出码 $R2）。请手动安装 Node.js 22.19+ 后重试。"
      Abort
    ${EndIf}
    DetailPrint "  [OK] Node.js 22.19.0 安装完成"
  ${ElseIf} $R0 != "0"
    FileClose $R9
    MessageBox MB_OK "无法检测 Node.js，安装已取消。$\r$\n$R1"
    Abort
  ${Else}
    DetailPrint "  步骤 2.3: 本机已满足 Node 版本要求"
    DetailPrint "  [OK] 已检测到可用的 Node.js: $R1"
  ${EndIf}

  DetailPrint "----------------------------------------"
  DetailPrint "[阶段 3/5] 解压业务运行时 modules.zip"
  DetailPrint "  源: $INSTDIR\resources\dsh\modules.zip"
  DetailPrint "  目标: $INSTDIR\resources\dsh\node_modules\"
  FileWrite $R9 "[阶段 3/5] 解压 modules.zip$\r$\n"
  IfFileExists "$INSTDIR\resources\dsh\modules.zip" 0 skip_unzip
    DetailPrint "  使用 tar 解压..."
    nsExec::ExecToStack '"$SYSDIR\tar.exe" -xf "$INSTDIR\resources\dsh\modules.zip" -C "$INSTDIR\resources\dsh"'
    Pop $R3
    Pop $R5
    DetailPrint "  tar 退出码: $R3"
    FileWrite $R9 "  tar exit=$R3$\r$\n"
    ${If} $R3 != "0"
      DetailPrint "  tar 失败，改用 PowerShell Expand-Archive..."
      nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath ''$INSTDIR\resources\dsh\modules.zip'' -DestinationPath ''$INSTDIR\resources\dsh'' -Force"'
      Pop $R4
      Pop $R6
      DetailPrint "  Expand-Archive 退出码: $R4"
      FileWrite $R9 "  Expand-Archive exit=$R4$\r$\n"
      ${If} $R4 != "0"
        FileClose $R9
        MessageBox MB_OK "运行时解压失败。请查看 install-steps.log。"
        Abort
      ${EndIf}
    ${EndIf}
    Delete "$INSTDIR\resources\dsh\modules.zip"
    DetailPrint "  [OK] 解压完成，已删除临时 zip"
    FileWrite $R9 "  modules.zip removed$\r$\n"
    Goto after_unzip
  skip_unzip:
    DetailPrint "  [跳过] 未找到 modules.zip"
    FileWrite $R9 "  modules.zip missing$\r$\n"
  after_unzip:

  DetailPrint "----------------------------------------"
  DetailPrint "[阶段 4/5] 校验运行时入口"
  FileWrite $R9 "[阶段 4/5] 运行时校验$\r$\n"
  !insertmacro VerifyFile "$INSTDIR\resources\dsh\lib\bin.js" "dsh 入口 lib/bin.js"
  !insertmacro VerifyFile "$INSTDIR\resources\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js" "dsh 包入口"

  DetailPrint "----------------------------------------"
  DetailPrint "[阶段 5/5] 安装收尾"
  DetailPrint "  · 注册卸载信息"
  DetailPrint "  · 创建开始菜单/桌面快捷方式"
  DetailPrint "  · 写入 install-steps.log"
  FileWrite $R9 "[阶段 5/5] 安装完成$\r$\n"
  FileWrite $R9 "日志路径: $INSTDIR\install-steps.log$\r$\n"
  FileClose $R9
  DetailPrint "[完成] 全部步骤结束。日志: $INSTDIR\install-steps.log"
!macroend

!macro customUnInstall
  SetDetailsPrint none
!macroend
