/**
 * Test Suite for DhakaFlix Nuvio Provider
 * Verifies contract conformity, URL encoding rules, HTML parsing,
 * season/episode resolution, circuit breaker, caching, and stream schema compliance.
 */

const assert = require("assert");

// Test bundled / transpiled provider
const provider = require("./providers/bdix-dhakaflix.js");

// Test source utilities
const {
  cleanTitle,
  nameFromUrl,
  normalizeStreamUrl,
  parseQuality,
  extractMediaTags,
  cleanFileName,
  generateSearchQueries
} = require("./src/bdix-dhakaflix/utils.js");

const {
  parseDirectoryHtml,
  isTitleMatch,
  matchesSeasonFolder,
  matchesEpisodeFile
} = require("./src/bdix-dhakaflix/h5ai.js");

const { BoundedCache } = require("./src/bdix-dhakaflix/cache.js");
const { isHostDead, markHostDead, markHostAlive } = require("./src/bdix-dhakaflix/circuitBreaker.js");
const { routeServers } = require("./src/bdix-dhakaflix/routing.js");

let passedTests = 0;
let failedTests = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

async function itAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

async function runAllTests() {
  console.log("=================================================");
  console.log("🚀 Running DhakaFlix Nuvio Provider Test Suite");
  console.log("=================================================\n");

  // ---------------------------------------------------------------------------
  // 1. Contract & Interface Tests
  // ---------------------------------------------------------------------------
  console.log("📋 Group 1: Contract & Interface Conformance");

  it("Exports getStreams function", () => {
    assert.strictEqual(typeof provider.getStreams, "function");
  });

  await itAsync(
    "Calling getStreams with missing tmdbId returns empty array without throwing",
    async () => {
      const result = await provider.getStreams("", "movie");
      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 0);
    }
  );

  await itAsync(
    "Calling getStreams with missing TV season/episode returns empty array without throwing",
    async () => {
      const result = await provider.getStreams("1399", "tv", null, null);
      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 0);
    }
  );

  // ---------------------------------------------------------------------------
  // 2. URL Normalization & Safe Encoding (BDIX FTP Constraints)
  // ---------------------------------------------------------------------------
  console.log("\n🔗 Group 2: URL Normalization & Safe Encoding");

  it("Encodes spaces into %20 without breaking domain or protocol", () => {
    const url = normalizeStreamUrl(
      "http://172.16.50.14",
      "/DHAKA-FLIX-14/English Movies (1080p)/(2024) 1080p/Movie.mkv"
    );
    assert.ok(!url.includes(" "));
    assert.ok(url.includes("English%20Movies"));
    assert.ok(url.startsWith("http://172.16.50.14/DHAKA-FLIX-14/"));
  });

  it("Encodes brackets and parentheses to prevent player crashes", () => {
    const url = normalizeStreamUrl(
      "http://172.16.50.14",
      "/DHAKA-FLIX-14/Movie [1080p] (2024)/Movie.mkv"
    );
    assert.ok(url.includes("%5B1080p%5D"));
    assert.ok(url.includes("%282024%29"));
  });

  it("Prevents double-encoding of already-encoded URL paths", () => {
    const input =
      "/DHAKA-FLIX-14/English%20Movies%20%281080p%29/Movie%20%5B1080p%5D.mkv";
    const url1 = normalizeStreamUrl("http://172.16.50.14", input);
    const url2 = normalizeStreamUrl("http://172.16.50.14", url1);
    assert.strictEqual(url1, url2);
    assert.ok(!url1.includes("%2520"));
  });

  it("Encodes hash symbol (#) into %23 so client does not treat it as URL fragment", () => {
    const url = normalizeStreamUrl(
      "http://172.16.50.9",
      "/DHAKA-FLIX-9/Awards & TV Shows/# TV SHOWS/show.mp4"
    );
    assert.ok(url.includes("/%23%20TV%20SHOWS/"));
    assert.ok(!url.includes("#"));
  });

  // ---------------------------------------------------------------------------
  // 3. Kotlin Reverse-Engineered Title & Name Parsers
  // ---------------------------------------------------------------------------
  console.log("\n🧹 Group 3: Kotlin Cleaners & Name Parsing");

  it("cleanTitle strips numeric numbering and year brackets", () => {
    const title1 = cleanTitle("01. The Matrix (1999) 1080p");
    assert.strictEqual(title1, "The Matrix");

    const title2 = cleanTitle("12. Breaking Bad (2008-2013)");
    assert.strictEqual(title2, "Breaking Bad");
  });

  it("nameFromUrl extracts decoded folder/file name from URL", () => {
    const name1 = nameFromUrl(
      "/DHAKA-FLIX-14/English%20Movies%20(1080p)/Deadpool%20and%20Wolverine%202024%201080p/"
    );
    assert.strictEqual(name1, "Deadpool and Wolverine 2024 1080p");

    const name2 = nameFromUrl(
      "/DHAKA-FLIX-12/TV-WEB-Series/Breaking%20Bad/Season%2001/Breaking.Bad.S01E01.mkv"
    );
    assert.strictEqual(name2, "Breaking.Bad.S01E01.mkv");
  });

  it("generateSearchQueries creates smart title variants", () => {
    const queries = generateSearchQueries(
      "Spider-Man: Across the Spider-Verse",
      "Spider-Man: Across the Spider-Verse"
    );
    assert.ok(queries.length >= 2);
    assert.ok(queries.some((q) => q.includes("Spider-Man")));
  });

  // ---------------------------------------------------------------------------
  // 4. Quality & Media Tag Detection
  // ---------------------------------------------------------------------------
  console.log("\n📺 Group 4: Quality & Media Tag Detection");

  it("parseQuality correctly detects resolutions", () => {
    assert.strictEqual(parseQuality("Movie.2024.2160p.UHD.mkv"), "4K");
    assert.strictEqual(parseQuality("Movie.2024.1080p.FHD.mkv"), "1080p");
    assert.strictEqual(parseQuality("Movie.2024.720p.HD.mkv"), "720p");
    assert.strictEqual(parseQuality("Movie.2024.480p.SD.mkv"), "480p");
    assert.strictEqual(parseQuality("Movie.2024.HDCAM.mkv"), "CAM");
    assert.strictEqual(parseQuality("Movie.2024.mkv"), "HD");
  });

  it("extractMediaTags detects audio and subtitle indicators", () => {
    const tags = extractMediaTags("Movie.2024.1080p.Dual.Audio.HEVC.10bit.ESub.mkv");
    assert.ok(tags.includes("Dual Audio"));
    assert.ok(tags.includes("HEVC"));
    assert.ok(tags.includes("10bit"));
    assert.ok(tags.includes("ESub"));
  });

  // ---------------------------------------------------------------------------
  // 5. Title Matching & False Positive Rejection
  // ---------------------------------------------------------------------------
  console.log("\n🎯 Group 5: Title Matching & False Positive Rejection");

  it("isTitleMatch matches genuine movie and rejects different titles", () => {
    assert.ok(
      isTitleMatch("Dune Part Two 2024 1080p", "Dune: Part Two", "2024", "movie")
    );
    assert.ok(
      isTitleMatch("The Matrix 1999 1080p BluRay", "The Matrix", "1999", "movie")
    );
    assert.ok(
      !isTitleMatch("The Dark Knight 2008", "Dark", "2017", "tv"),
      "Should not match 'Dark' to 'The Dark Knight'"
    );
    assert.ok(
      !isTitleMatch("Gladiator 2000 1080p", "Gladiator II", "2024", "movie"),
      "Should not match 'Gladiator (2000)' to 'Gladiator II (2024)'"
    );
    assert.ok(
      isTitleMatch(
        "Breaking Bad (TV Series 2008–2013) 1080p [Dual Audio]",
        "Breaking Bad",
        "2008",
        "tv"
      )
    );
    assert.ok(
      isTitleMatch(
        "Breaking Bad S01E01  1080p BluRay x265 HEVC ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv",
        "Breaking Bad",
        "2008",
        "tv"
      )
    );
  });

  // ---------------------------------------------------------------------------
  // 6. Season and Episode Matching
  // ---------------------------------------------------------------------------
  console.log("\n🎬 Group 6: Season and Episode Matching");

  it("matchesSeasonFolder matches various season directory naming conventions", () => {
    assert.ok(matchesSeasonFolder("Season 01", 1));
    assert.ok(matchesSeasonFolder("Season 1", 1));
    assert.ok(matchesSeasonFolder("S02", 2));
    assert.ok(matchesSeasonFolder("Series 03", 3));
    assert.ok(!matchesSeasonFolder("Season 02", 1));
  });

  it("matchesEpisodeFile matches standard SxxExx and 1x05 patterns", () => {
    assert.ok(matchesEpisodeFile("Breaking.Bad.S01E03.1080p.mkv", 1, 3, false));
    assert.ok(matchesEpisodeFile("Breaking.Bad.1x03.720p.mkv", 1, 3, false));
    assert.ok(!matchesEpisodeFile("Breaking.Bad.S01E04.mkv", 1, 3, false));
    assert.ok(!matchesEpisodeFile("Breaking.Bad.S02E03.mkv", 1, 3, false));
  });

  it("matchesEpisodeFile matches relative episode inside verified season folder", () => {
    assert.ok(matchesEpisodeFile("Episode 05.mkv", 1, 5, true));
    assert.ok(matchesEpisodeFile("EP05.mkv", 1, 5, true));
    assert.ok(matchesEpisodeFile("05.mkv", 1, 5, true));
  });

  // ---------------------------------------------------------------------------
  // 7. h5ai HTML Directory Parsing
  // ---------------------------------------------------------------------------
  console.log("\n📄 Group 7: h5ai HTML Directory Parsing");

  it("parseDirectoryHtml extracts folders and video files accurately from h5ai table markup", () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
      <body>
      <table id="fallback">
        <tbody>
          <tr><th>Name</th></tr>
          <tr><td class="fb-i"><img alt="parent" src="/_h5ai/icons/parent.png"></td><td class="fb-n"><a href="../">Parent Directory</a></td></tr>
          <tr>
            <td class="fb-i"><img alt="folder" src="/_h5ai/icons/folder.png"></td>
            <td class="fb-n"><a href="/DHAKA-FLIX-12/TV/Show/Season%2001/">Season 01/</a></td>
          </tr>
          <tr>
            <td class="fb-i"><img alt="file" src="/_h5ai/icons/file.png"></td>
            <td class="fb-n"><a href="/DHAKA-FLIX-12/TV/Show/poster.jpg">poster.jpg</a></td>
          </tr>
          <tr>
            <td class="fb-i"><img alt="file" src="/_h5ai/icons/video.png"></td>
            <td class="fb-n"><a href="/DHAKA-FLIX-12/TV/Show/Episode01.1080p.mkv">Episode01.1080p.mkv</a></td>
          </tr>
        </tbody>
      </table>
      </body>
      </html>
    `;

    const parsed = parseDirectoryHtml(sampleHtml, "/DHAKA-FLIX-12/TV/Show/");
    assert.strictEqual(parsed.folders.length, 1);
    assert.strictEqual(parsed.folders[0].name, "Season 01/");
    assert.strictEqual(parsed.files.length, 1);
    assert.strictEqual(parsed.files[0].name, "Episode01.1080p.mkv");
  });

  // ---------------------------------------------------------------------------
  // 8. Bounded LRU Cache & Circuit Breaker Tests
  // ---------------------------------------------------------------------------
  console.log("\n⚡ Group 8: Cache & Circuit Breaker Verification");

  it("BoundedCache evicts oldest item when maxEntries is reached", () => {
    const cache = new BoundedCache(2, 60000);
    cache.set("a", 1);
    cache.set("b", 2);
    assert.strictEqual(cache.get("a"), 1);
    cache.set("c", 3); // Should evict "b" because "a" was refreshed by get
    assert.strictEqual(cache.get("a"), 1);
    assert.strictEqual(cache.get("b"), null);
    assert.strictEqual(cache.get("c"), 3);
  });

  it("Circuit breaker marks dead and skips host", () => {
    const testHost = "http://172.16.50.999";
    assert.strictEqual(isHostDead(testHost), false);
    markHostDead(testHost);
    assert.strictEqual(isHostDead(testHost), true);
    markHostAlive(testHost);
    assert.strictEqual(isHostDead(testHost), false);
  });

  it("Smart routing prioritizes servers by language and genre", () => {
    // English movie -> Servers 14, 7
    const movieRoute = routeServers("movie", { original_language: "en", genre_ids: [18] });
    assert.ok(movieRoute.primary.some((s) => s.id === "14"));
    assert.ok(movieRoute.primary.some((s) => s.id === "7"));
    assert.ok(!movieRoute.primary.some((s) => s.id === "9")); // Server 9 excluded from primary

    // English TV show -> Server 12 primary
    const tvRoute = routeServers("tv", { original_language: "en", genre_ids: [18] });
    assert.strictEqual(tvRoute.primary.length, 1);
    assert.strictEqual(tvRoute.primary[0].id, "12");
  });

  // ---------------------------------------------------------------------------
  // 9. End-to-End Simulation with Mocked Fetch (Cold & Cached)
  // ---------------------------------------------------------------------------
  console.log("\n🌐 Group 9: End-to-End Mock Simulation (Movie & TV Caching)");

  await itAsync(
    "getStreams executes resolution and caches TV episodes for instant subsequent retrieval",
    async () => {
      const originalFetch = global.fetch;

      try {
        let tmdbCalls = 0;
        let dhakaFlixSearchCalls = 0;

        global.fetch = async (url, options = {}) => {
          const urlStr = url.toString();

          // Mock TMDB
          if (urlStr.includes("api.themoviedb.org")) {
            tmdbCalls++;
            return {
              ok: true,
              status: 200,
              json: async () => ({
                id: 1396,
                name: "Breaking Bad",
                original_name: "Breaking Bad",
                first_air_date: "2008-01-20",
                original_language: "en",
                genres: [{ id: 18, name: "Drama" }]
              })
            };
          }

          // Mock DhakaFlix Server 12 Search POST
          if (
            urlStr.includes("172.16.50.12/DHAKA-FLIX-12/") &&
            options.method === "POST"
          ) {
            dhakaFlixSearchCalls++;
            return {
              ok: true,
              status: 200,
              json: async () => ({
                search: [
                  {
                    href: "/DHAKA-FLIX-12/TV-WEB-Series/TV%20Series%20%E2%99%A5%20%20A%20%20%E2%80%94%20%20L/Breaking%20Bad/Season%201/Breaking%20Bad%20S01E01%201080p.mkv",
                    size: 1000000000
                  },
                  {
                    href: "/DHAKA-FLIX-12/TV-WEB-Series/TV%20Series%20%E2%99%A5%20%20A%20%20%E2%80%94%20%20L/Breaking%20Bad/Season%201/Breaking%20Bad%20S01E02%201080p.mkv",
                    size: 1000000000
                  }
                ]
              })
            };
          }

          return {
            ok: false,
            status: 404,
            json: async () => ({ search: [] }),
            text: async () => ""
          };
        };

        // Episode 1 (Cold)
        const ep1Streams = await provider.getStreams("1396", "tv", 1, 1);
        assert.strictEqual(ep1Streams.length, 1);
        assert.ok(ep1Streams[0].title.includes("S01E01"));
        assert.strictEqual(tmdbCalls, 1);
        assert.strictEqual(dhakaFlixSearchCalls, 1);

        // Episode 2 (Cached TMDB & Search)
        const ep2Streams = await provider.getStreams("1396", "tv", 1, 2);
        assert.strictEqual(ep2Streams.length, 1);
        assert.ok(ep2Streams[0].title.includes("S01E02"));
        // Confirm cache prevented duplicate network requests
        assert.strictEqual(tmdbCalls, 1);
        assert.strictEqual(dhakaFlixSearchCalls, 1);
      } finally {
        global.fetch = originalFetch;
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Final Summary
  // ---------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log(`🏁 Test Summary: ${passedTests} Passed, ${failedTests} Failed`);
  console.log("=================================================");

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log("🎉 All tests passed successfully!");
  }
}

runAllTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
