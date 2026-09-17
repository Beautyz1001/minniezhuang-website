# framing-match.ps1  --  the measuring step of the "qujing" (re-framing) operation.
#
# WHY THIS EXISTS
#   AGENTS.md section 1b forbids eyeballing a reference image. This script does step 2:
#   given the user's reference screenshot and the site's source asset, it finds WHICH
#   window of the asset the reference is showing, then prints the three CSS numbers.
#
# ASCII ONLY ON PURPOSE
#   Windows PowerShell 5.1 decodes .ps1 as system ANSI. Non-ASCII comments turn into
#   garbage bytes and the parser reports a bogus "unexpected }" on an unrelated line.
#   Cost ~7 rounds of brace-bisecting once. Keep every character in this file ASCII.
#
# WHY THE HOT LOOPS ARE C#
#   The first version did the pixel loops in PowerShell: one match took ~5 minutes and
#   the user (rightly) lost patience. Same algorithm compiled via Add-Type runs in a
#   few seconds. Never put a per-pixel loop in PowerShell in this project.
#
# USAGE
#   1) Find the image band inside the reference screenshot:
#        .\framing-match.ps1 -Ref ref.png -Detect
#      (add -ScanX0/-ScanX1 to restrict the row scan, -ScanY0/-ScanY1 for the columns)
#   2) Match and get the CSS numbers:
#        .\framing-match.ps1 -Ref ref.png -Asset ..\assets\...\x.jpg `
#                            -RefX 93 -RefY 168 -RefW 1278 -RefH 640 -CellRatio 2.0132
#
#   -CellRatio is the live cell's width/height, measured in the browser, never guessed.

param(
  [Parameter(Mandatory=$true)][string]$Ref,
  [string]$Asset,
  [switch]$Detect,
  [int]$RefX, [int]$RefY, [int]$RefW, [int]$RefH,
  [double]$CellRatio = 0,
  [int]$Threshold = 30,
  [int]$ScanX0 = -1, [int]$ScanX1 = -1,
  [int]$ScanY0 = -1, [int]$ScanY1 = -1,
  # Where to write a side-by-side "reference band vs matched window" PNG.
  [string]$Compare = ""
)

Add-Type -AssemblyName System.Drawing

$cs = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

public class Framing {

  // Downsample a rectangle of an image to ow x oh and return it as grayscale floats.
  public static float[] LoadGray(string path, int sx, int sy, int sw, int sh, int ow, int oh) {
    using (Bitmap src = new Bitmap(path))
    using (Bitmap bmp = new Bitmap(ow, oh, PixelFormat.Format24bppRgb)) {
      using (Graphics g = Graphics.FromImage(bmp)) {
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.DrawImage(src, new Rectangle(0, 0, ow, oh), sx, sy, sw, sh, GraphicsUnit.Pixel);
      }
      BitmapData d = bmp.LockBits(new Rectangle(0, 0, ow, oh), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
      byte[] buf = new byte[d.Stride * oh];
      Marshal.Copy(d.Scan0, buf, 0, buf.Length);
      bmp.UnlockBits(d);
      float[] arr = new float[ow * oh];
      for (int y = 0; y < oh; y++) {
        int row = y * d.Stride;
        for (int x = 0; x < ow; x++) {
          int i = row + x * 3;
          arr[y * ow + x] = (float)(buf[i + 2] * 0.299 + buf[i + 1] * 0.587 + buf[i] * 0.114);
        }
      }
      return arr;
    }
  }

  // Per-column and per-row maximum brightness, used to locate the image band.
  public static int[] MaxProfile(string path, bool byColumn, int a0, int a1) {
    using (Bitmap b = new Bitmap(path)) {
      int W = b.Width, H = b.Height;
      BitmapData d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
      byte[] buf = new byte[d.Stride * H];
      Marshal.Copy(d.Scan0, buf, 0, buf.Length);
      b.UnlockBits(d);
      int n = byColumn ? W : H;
      int[] res = new int[n];
      int lo = (a0 < 0) ? 0 : a0;
      int hi = (a1 < 0) ? (byColumn ? H - 1 : W - 1) : a1;
      for (int k = 0; k < n; k++) {
        int m = 0;
        for (int j = lo; j <= hi; j++) {
          int x = byColumn ? k : j;
          int y = byColumn ? j : k;
          if (x < 0 || x >= W || y < 0 || y >= H) continue;
          int i = y * d.Stride + x * 3;
          int l = (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
          if (l > m) m = l;
        }
        res[k] = m;
      }
      return res;
    }
  }

  // Normalised cross-correlation search over window width / x / y.
  // Returns { score, ws, hs, x0, y0 } in downsampled source coordinates.
  public static double[] Search(float[] src, int SW, int SH, float[] tgt, int TW, int TH,
                                double winRatio,
                                int wsMin, int wsMax, int wsStep,
                                int xMin, int xMax, int xStep,
                                int yMin, int yMax, int yStep) {
    int N = TW * TH;
    double tm = 0;
    for (int i = 0; i < N; i++) tm += tgt[i];
    tm /= N;
    double[] tn = new double[N];
    double ts = 0;
    for (int i = 0; i < N; i++) { tn[i] = tgt[i] - tm; ts += tn[i] * tn[i]; }
    ts = Math.Sqrt(ts);

    double[] samp = new double[N];
    int[] sxOff = new int[TW];
    int[] syOff = new int[TH];

    double bestScore = -2, bws = 0, bhs = 0, bx = 0, by = 0;

    for (int ws = wsMin; ws <= wsMax; ws += wsStep) {
      double hs = ws / winRatio;
      if (hs > SH || ws > SW) continue;
      for (int tx = 0; tx < TW; tx++) sxOff[tx] = (int)((tx + 0.5) * ws / TW);
      for (int ty = 0; ty < TH; ty++) syOff[ty] = (int)((ty + 0.5) * hs / TH);

      for (int x0 = xMin; x0 <= xMax; x0 += xStep) {
        if (x0 < 0 || x0 + ws > SW) continue;
        for (int y0 = yMin; y0 <= yMax; y0 += yStep) {
          if (y0 < 0 || y0 + hs > SH) continue;

          double sum = 0;
          int k = 0;
          for (int ty = 0; ty < TH; ty++) {
            int sy = y0 + syOff[ty];
            if (sy >= SH) sy = SH - 1;
            int row = sy * SW;
            for (int tx = 0; tx < TW; tx++) {
              int sx = x0 + sxOff[tx];
              if (sx >= SW) sx = SW - 1;
              double v = src[row + sx];
              samp[k++] = v;
              sum += v;
            }
          }
          double mean = sum / N;
          double num = 0, den = 0;
          for (int i = 0; i < N; i++) { double dd = samp[i] - mean; num += dd * tn[i]; den += dd * dd; }
          den = Math.Sqrt(den);
          if (den > 0) {
            double score = num / (den * ts);
            if (score > bestScore) { bestScore = score; bws = ws; bhs = hs; bx = x0; by = y0; }
          }
        }
      }
    }
    return new double[] { bestScore, bws, bhs, bx, by };
  }

  // Render the reference band and the matched window one above the other, for eyeballing.
  public static void SaveCompare(string refPath, int rx, int ry, int rw, int rh,
                                 string assetPath, int ax, int ay, int aw, int ah, string outPath) {
    int W = 760, H = 380;
    using (Bitmap outBmp = new Bitmap(W, H * 2 + 16))
    using (Graphics g = Graphics.FromImage(outBmp)) {
      g.InterpolationMode = InterpolationMode.HighQualityBicubic;
      g.Clear(Color.Magenta);
      using (Bitmap a = new Bitmap(refPath))
        g.DrawImage(a, new Rectangle(0, 0, W, H), rx, ry, rw, rh, GraphicsUnit.Pixel);
      using (Bitmap b = new Bitmap(assetPath))
        g.DrawImage(b, new Rectangle(0, H + 16, W, H), ax, ay, aw, ah, GraphicsUnit.Pixel);
      outBmp.Save(outPath, ImageFormat.Png);
    }
  }
}
'@

if (-not ([System.Management.Automation.PSTypeName]'Framing').Type) {
  Add-Type -TypeDefinition $cs -ReferencedAssemblies System.Drawing
}

# ---- mode 1: locate the image band inside the reference screenshot -------------------
# The band sits on the page's near-black background. A column crossing the artwork has
# SOME bright pixel in it; a column of pure background does not. Same for rows. Pass
# -ScanX0/-ScanX1 so a text column elsewhere on the page cannot widen the row run.
if ($Detect) {
  $img = [System.Drawing.Image]::FromFile($Ref)
  $W = $img.Width; $H = $img.Height
  $img.Dispose()
  $cols = [Framing]::MaxProfile($Ref, $true,  $ScanY0, $ScanY1)
  $rows = [Framing]::MaxProfile($Ref, $false, $ScanX0, $ScanX1)
  "ref size: $W x $H   threshold: $Threshold"
  foreach ($pair in @(@('column runs (x)', $cols), @('row runs (y)', $rows))) {
    "--- $($pair[0]) ---"
    $arr = $pair[1]
    $in = $false; $start = 0
    for ($k = 0; $k -lt $arr.Length; $k++) {
      $on = $arr[$k] -gt $Threshold
      if ($on -and -not $in) { $start = $k; $in = $true }
      if (-not $on -and $in) { if (($k - $start) -gt 40) { "  $start .. $($k-1)   (len $($k-$start))" }; $in = $false }
    }
    if ($in -and (($arr.Length - $start) -gt 40)) { "  $start .. $($arr.Length-1)   (len $($arr.Length-$start))" }
  }
  ""
  "Pick the run that is the image band, check its w/h against the live cell ratio,"
  "then re-run without -Detect passing -RefX -RefY -RefW -RefH -CellRatio."
  return
}

# PowerShell variable names are CASE-INSENSITIVE: $X0 and $x0 are the SAME variable.
# Writing $X0 = $x0*$f destroys $x0, and the next line silently computes garbage.
# Hence the deliberately distinct names below ($winX0 vs $x0, $timer vs $SW).
# ---- mode 2: match --------------------------------------------------------------------
if (-not $Asset) { throw "-Asset is required unless -Detect is used" }
if ($RefW -le 0 -or $RefH -le 0) { throw "-RefX -RefY -RefW -RefH are required" }

$img = [System.Drawing.Image]::FromFile($Asset)
$AW = $img.Width; $AH = $img.Height
$img.Dispose()

$timer = [System.Diagnostics.Stopwatch]::StartNew()

$SW = 320; $SH = [int][math]::Round($SW * $AH / $AW)
$src = [Framing]::LoadGray($Asset, 0, 0, $AW, $AH, $SW, $SH)

$TW = 48; $TH = [int][math]::Round($TW * $RefH / $RefW)
$tgt = [Framing]::LoadGray($Ref, $RefX, $RefY, $RefW, $RefH, $TW, $TH)

$winRatio = [double]$RefW / [double]$RefH

$coarse = [Framing]::Search($src, $SW, $SH, $tgt, $TW, $TH, $winRatio, 100, $SW, 2, 0, $SW, 2, 0, $SH, 2)
$cws = [int]$coarse[1]; $cx = [int]$coarse[3]; $cy = [int]$coarse[4]
$b = [Framing]::Search($src, $SW, $SH, $tgt, $TW, $TH, $winRatio,
                       ($cws-3), ($cws+3), 1, ($cx-3), ($cx+3), 1, ($cy-3), ($cy+3), 1)
$timer.Stop()

$score = $b[0]; $ws = $b[1]; $hs = $b[2]; $x0 = $b[3]; $y0 = $b[4]

$f = [double]$AW / $SW
$winX0 = $x0*$f; $winX1 = ($x0+$ws)*$f
$winY0 = $y0*$f; $winY1 = ($y0+$hs)*$f
$visW = ($winX1-$winX0)/$AW
$visH = ($winY1-$winY0)/$AH
$cropL = $winX0/$AW
$cropT = $winY0/$AH

""
"asset       : $AW x $AH   ratio {0:N3}" -f ($AW/$AH)
"elapsed     : {0:N1}s" -f ($timer.Elapsed.TotalSeconds)
"score       : {0:N4}   (below 0.90 = show the user the -Compare image before trusting it)" -f $score
"window      : x {0:N0}..{1:N0}   y {2:N0}..{3:N0}" -f $winX0,$winX1,$winY0,$winY1
"visible     : w {0:P2}   h {1:P2}" -f $visW,$visH
"cropped     : left {0:P2}  right {1:P2}  top {2:P2}  bottom {3:P2}" -f $cropL,(1-$visW-$cropL),$cropT,(1-$visH-$cropT)

if ($Compare -ne "") {
  [Framing]::SaveCompare($Ref, $RefX, $RefY, $RefW, $RefH, $Asset,
                         [int]$winX0, [int]$winY0, [int]($winX1-$winX0), [int]($winY1-$winY0), $Compare)
  "compare     : $Compare  (top = your reference, bottom = what the match says)"
}

if ($CellRatio -gt 0) {
  # The image element is width:100% of the cell, height:N% of the cell, object-fit:cover.
  #
  # ONE number (height) sets the zoom in BOTH directions, but only while cover is
  # HEIGHT-driven, i.e. while N * assetRatio > CellRatio. Below that threshold the cell
  # is wider than the image, cover switches to WIDTH-driven, the visible height is
  # pinned at assetRatio/CellRatio and changing height does nothing at all.
  #   threshold N = CellRatio / assetRatio
  $assetRatio = [double]$AW / $AH
  $threshN = $CellRatio / $assetRatio
  $N_fromH = 1.0/$visH
  $N_fromW = $CellRatio/($visW*$assetRatio)
  $N = ($N_fromH + $N_fromW)/2
  $visWat = $CellRatio/($N*$assetRatio)
  $objX = $cropL/(1-$visWat)
  $hiddenTopDefault = ($N-1)/2      # cell heights hidden above, when simply centred
  $hiddenTopWanted  = $cropT*$N
  $topShift = $hiddenTopWanted - $hiddenTopDefault
  $hideTop = $hiddenTopWanted
  $hideBot = $N - 1 - $hideTop
  $limit = ([math]::Min($hideTop,$hideBot))/$N
  ""
  "----- CSS (one cell's own selector only, never a shared rule) -----"
  "  position         : relative"
  "  top              : {0:N2}%          (NEVER transform - GSAP rewrites transform every frame)" -f (-$topShift*100)
  "  height           : {0:N1}%" -f ($N*100)
  "  object-position  : {0:N0}% 50%      (the 50% is inert while cover is height-driven)" -f ($objX*100)
  ""
  "  cover switches to width-driven below height {0:N1}% - stay above it" -f ($threshN*100)
  "  slide head-room  : top {0:P1} / bottom {1:P1} of the cell height" -f $hideTop,$hideBot
  "  max data-slide   : {0:N1}   (omit the attribute to keep the site default 6)" -f ($limit*100)
  if (($limit*100) -lt 6) { "  -> WARNING: this framing cannot hold the site-wide +/-6%. Tell the user; do not silently re-frame." }
  ""
  "Now verify in the browser. Do not believe any of this until you have looked at it."
}
