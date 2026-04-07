$ErrorActionPreference = "Stop"

$port = 8080
$root = Join-Path $PSScriptRoot "validacao"
$frontendRoot = Join-Path $PSScriptRoot "frontend"
$adminRoot = Join-Path $PSScriptRoot "frontend_admin"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
$listener.Start()

function Get-ContentType {
  param([string]$Path)

  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { return "text/html; charset=utf-8" }
    ".css" { return "text/css; charset=utf-8" }
    ".js" { return "application/javascript; charset=utf-8" }
    ".json" { return "application/json; charset=utf-8" }
    default { return "application/octet-stream" }
  }
}

function Resolve-RequestedFile {
  param([string]$RequestPath)

  $relativePath = [System.Uri]::UnescapeDataString($RequestPath.TrimStart("/"))
  if ([string]::IsNullOrWhiteSpace($relativePath)) {
    return Join-Path $root "index.html"
  }

  if ($relativePath -eq "cliente" -or $relativePath -eq "cliente/") {
    return Join-Path $frontendRoot "index.html"
  }

  if ($relativePath -like "cliente/*") {
    $subPath = $relativePath.Substring("cliente/".Length).Replace("/", "\")
    if ([string]::IsNullOrWhiteSpace($subPath)) {
      $subPath = "index.html"
    }
    return Join-Path $frontendRoot $subPath
  }

  if ($relativePath -eq "admin" -or $relativePath -eq "admin/") {
    return Join-Path $adminRoot "index.html"
  }

  if ($relativePath -like "admin/*") {
    $subPath = $relativePath.Substring("admin/".Length).Replace("/", "\")
    if ([string]::IsNullOrWhiteSpace($subPath)) {
      $subPath = "index.html"
    }
    return Join-Path $adminRoot $subPath
  }

  return Join-Path $root ($relativePath.Replace("/", "\"))
}

$url = "http://127.0.0.1:$port/"
Start-Process $url
Write-Output "Serving validation hub on $url"

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()

    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()

      if ([string]::IsNullOrWhiteSpace($requestLine)) {
        $client.Close()
        continue
      }

      while ($true) {
        $headerLine = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($headerLine)) {
          break
        }
      }

      $parts = $requestLine.Split(" ")
      $rawPath = if ($parts.Length -ge 2) { $parts[1] } else { "/" }
      $pathOnly = ($rawPath -split "\?")[0]
      $filePath = Resolve-RequestedFile -RequestPath $pathOnly
      $fileFullPath = [System.IO.Path]::GetFullPath($filePath)

      if (-not (Test-Path -LiteralPath $fileFullPath -PathType Leaf)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("Arquivo nao encontrado.")
        $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
        $stream.Write($headerBytes, 0, $headerBytes.Length)
        $stream.Write($body, 0, $body.Length)
        $stream.Flush()
        $client.Close()
        continue
      }

      $body = [System.IO.File]::ReadAllBytes($fileFullPath)
      $contentType = Get-ContentType -Path $fileFullPath
      $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($body, 0, $body.Length)
      $stream.Flush()
    }
    finally {
      $client.Close()
    }
  }
}
finally {
  $listener.Stop()
}
