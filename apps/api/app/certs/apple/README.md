# Apple Root Certificates

The App Store Server Notifications endpoint verifies JWS signatures
against these pinned Apple root certificates. Download them from
https://www.apple.com/certificateauthority/ and commit the `.cer`
files to this directory:

- AppleRootCA-G3.cer (signs current App Store leaf certs)
- AppleRootCA-G2.cer
- AppleIncRootCertificate.cer
- AppleComputerRootCertificate.cer

PowerShell:

```powershell
cd C:\Users\gwiza\Desktop\Dev\tarantuverse\apps\api\app\certs\apple
Invoke-WebRequest -Uri https://www.apple.com/certificateauthority/AppleRootCA-G3.cer -OutFile AppleRootCA-G3.cer
Invoke-WebRequest -Uri https://www.apple.com/certificateauthority/AppleRootCA-G2.cer -OutFile AppleRootCA-G2.cer
Invoke-WebRequest -Uri https://www.apple.com/appleca/AppleIncRootCertificate.cer -OutFile AppleIncRootCertificate.cer
Invoke-WebRequest -Uri https://www.apple.com/certificateauthority/AppleComputerRootCertificate.cer -OutFile AppleComputerRootCertificate.cer
```

If this directory contains no certificates at runtime, the endpoint
returns 401 for every notification and logs the reason — premium state
simply stops syncing, nothing else breaks.
