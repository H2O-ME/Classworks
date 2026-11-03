# Windows 客户端签名

未签名的 exe 在教室里会遇到两件事：SmartScreen 弹「Windows 已保护你的电脑」、个别杀软误报。
三条路，按「要不要花钱 / 冰点还原能不能扛住」选。

## 方案对比

| 方案 | 成本 | SmartScreen 表现 | 适合场景 | 冰点还原 |
| --- | --- | --- | --- | --- |
| **不签名 + 加白名单** | 0 | 首次要手动「更多信息 → 仍要运行」 | 就一两台固定讲台机 | 不受影响（无证书要装） |
| **自签名证书** | 0 | 导入证书的机器上不报；未导入的照报 | 学校自己的机器群，能统一导证书 | **麻烦**：证书在 C 盘，还原后要重导 |
| **Azure Trusted Signing** | 约 $9.99/月 | 证书受信任，但声誉仍需时间积累 | 想长期分发、不想买 USB token | 不受影响（签名在云端做） |
| **OV / EV 代码签名证书** | $200–600/年 | EV 立即受信；OV 有声誉积累期 | 对外正式分发 | 不受影响 |

> 结论：教室场景优先「不签名 + 白名单」或「Azure Trusted Signing」。
> 自签名看起来免费，但冰点还原每天重置 C 盘的证书存储，等于每天重导一次，不划算。

## 一、不签名（推荐先用这个）

1. 首次运行点「更多信息 → 仍要运行」。
2. Defender 排除项（减少误报）：
   ```powershell
   Add-MpPreference -ExclusionPath "D:\Classworks"
   ```
3. 想彻底没有 exe 弹窗：改用 `win/install.cmd`（Edge 应用窗口），根本没有 exe 要签。

## 二、Azure Trusted Signing（要长期分发时）

1. Azure 门户创建 Trusted Signing 账户 → 身份验证（个人需满足账号历史要求，企业需营业执照）→ 创建证书配置文件（Certificate Profile）。
2. 记录三项：Endpoint、Account Name、Profile Name；下载服务主体的凭据。
3. CI 里用微软官方 action 签名（Tauri 支持自定义 `signCommand`）：

```yaml
      - uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: 构建并签名
        working-directory: client
        shell: pwsh
        run: |
          $sign = '{"bundle":{"windows":{"signCommand":{"cmd":"TrustedSigningClientTools\\sign","args":["sign","/v","/fd","sha256","/tr","http://timestamp.acs.microsoft.com","/td","sha256","/dlib","azurecodetrust.lib","/dmdf","$env:TS_METADATA","$1"]}}}}'
          pnpm dlx @tauri-apps/cli@^2 build --config $sign
        env:
          TS_METADATA: ${{ secrets.TS_METADATA }} # 见微软文档的 metadata JSON
```

## 三、自签名证书（仅限完全自治的机房）

```powershell
# 1) 生成自签代码签名证书（有效 3 年）
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Classworks Class" `
  -KeyUsage DigitalSignature -FriendlyName "Classworks 自签" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
$pwd = ConvertTo-SecureString -String "你的导出密码" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "classworks-sign.pfx" -Password $pwd
Export-Certificate -Cert $cert -FilePath "classworks-sign.cer"
```

```powershell
# 2) 签名（本地或 CI）
signtool sign /fd sha256 /tr http://timestamp.digicert.com /td sha256 `
  /f classworks-sign.pfx /p "你的导出密码" `
  "client\target\release\bundle\nsis\作业看板_0.1.0_x64-setup.exe"
```

```powershell
# 3) 每台教室电脑导入信任（管理员 PowerShell；冰点还原后需重跑，建议放进每日开机脚本）
Import-Certificate -FilePath "classworks-sign.cer" -CertStoreLocation "Cert:\LocalMachine\Root"
Import-Certificate -FilePath "classworks-sign.cer" -CertStoreLocation "Cert:\LocalMachine\TrustedPublisher"
```

CI 里用 `signCommand` 传 pfx（Tauri v2）：

```yaml
      - name: 构建并签名
        working-directory: client
        shell: pwsh
        run: |
          [IO.File]::WriteAllBytes("cert.pfx", [Convert]::FromBase64String("${{ secrets.SIGN_PFX_BASE64 }}"))
          $sign = '{"bundle":{"windows":{"signCommand":{"cmd":"signtool","args":["sign","/fd","sha256","/tr","http://timestamp.digicert.com","/td","sha256","/f","cert.pfx","/p","$env:SIGN_PASS","$1"]}}}}'
          pnpm dlx @tauri-apps/cli@^2 build --config $sign
          Remove-Item cert.pfx
        env:
          SIGN_PASS: ${{ secrets.SIGN_PFX_PASS }}
```

## 验证签名

```powershell
Get-AuthenticodeSignature "client\target\release\bundle\nsis\作业看板_0.1.0_x64-setup.exe" | Format-List Status, SignerCertificate
```

`Status` 应为 `Valid`；`NotSigned` 说明没签上，`HashMismatch` 说明签完又被改过。
