# Security Policy

## Reporting a vulnerability

Report it through [private vulnerability reporting](https://github.com/Pal-AI-Lab/Coopanion/security/advisories/new).
Only the maintainers can read the report. Do not open a public issue for it.

Include the affected Coopanion version, your operating system, the steps that reproduce it, and
what an attacker gains.

## Supported versions

Fixes land on `main` and ship in the next release, which installed copies pick up through
automatic update. Earlier versions are not patched.

## Scope

In scope: everything in this repository, including the app, the settings window, the bundled
Worlds and figures, the installers and the update channel.

Out of scope:

- The Cortico framework itself. Report it to [Cortico](https://github.com/Pal-AI-Lab/Cortico/security/advisories/new).
- External extension packages. Report those to their own repository.
- A key leaked from your own machine. Revoke it with its provider.

## 中文

发现安全问题请通过[私密漏洞报告](https://github.com/Pal-AI-Lab/Coopanion/security/advisories/new)提交,
只有维护者能看到内容。不要开公开 issue。

报告里写明受影响的 Coopanion 版本、操作系统、复现步骤、攻击者能得到什么。

修复合进 `main`,随下一个版本发布,已安装的通过自动更新拿到;旧版本不单独打补丁。

范围是本仓库的全部内容。框架 Cortico 本身的问题报给 [Cortico](https://github.com/Pal-AI-Lab/Cortico/security/advisories/new);
外部扩展包的问题报给它自己的仓库;自己电脑上泄露的密钥请到对应服务商处吊销。
