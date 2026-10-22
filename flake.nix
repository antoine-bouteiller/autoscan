{
  description = "Autoscan - Media automation service";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    git-hooks = {
      url = "github:cachix/git-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = {
    self,
    nixpkgs,
    git-hooks,
  }: let
    supportedSystems = ["x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin"];
    forAllSystems = nixpkgs.lib.genAttrs supportedSystems;

    # Pins the Bun used by the build, the dev shell, and CI.
    # Keep `@types/bun` and `packageManager` in package.json on the same version.
    bunOverlay = final: prev: let
      pin = builtins.fromJSON (builtins.readFile ./nix/bun.json);
    in {
      bun = prev.bun.overrideAttrs (old: {
        inherit (pin) version;
        __intentionallyOverridingVersion = true;
        passthru =
          old.passthru
          // {
            sources = builtins.mapAttrs (_: source:
              final.fetchurl {
                url = "https://github.com/oven-sh/bun/releases/download/bun-v${pin.version}/${source.asset}.zip";
                inherit (source) hash;
              })
            pin.sources;
          };
      });
    };

    pkgsFor = system:
      import nixpkgs {
        inherit system;
        overlays = [bunOverlay];
      };

    # JS tooling runs from node_modules so hooks use the versions pinned in
    # package.json and the repo's custom oxlint plugins.
    gitHooksFor = system:
      git-hooks.lib.${system}.run {
        src = ./.;
        hooks = {
          convco.enable = true;
          alejandra = {
            enable = true;
            settings.verbosity = "quiet";
          };
          lockfile = {
            enable = true;
            name = "Check lockfile";
            entry = "bun install --frozen-lockfile --silent";
            pass_filenames = false;
            always_run = true;
          };
          lint = {
            enable = true;
            name = "oxlint";
            entry = "bunx oxlint --fix --fix-suggestions";
            files = "\\.(ts|js|mjs|cjs)$";
            excludes = ["^oxlint\\.config\\.ts$" "^oxfmt\\.config\\.ts$"];
          };
          format = {
            enable = true;
            name = "oxfmt";
            entry = "bunx oxfmt";
            excludes = ["\\.nix$"];
          };
          nix-deps = {
            enable = true;
            name = "Update nix/deps.json";
            entry = "bun scripts/nix_deps.ts";
            files = "^bun\\.lock$";
            pass_filenames = false;
          };
          knip = {
            enable = true;
            name = "knip";
            entry = "bun run knip";
            pass_filenames = false;
            always_run = true;
          };
          knip-production = {
            enable = true;
            name = "knip (production)";
            entry = "bun run knip:production";
            pass_filenames = false;
            always_run = true;
          };
        };
      };
  in
    {
      devShells = forAllSystems (system: let
        pkgs = pkgsFor system;
        gitHooks = gitHooksFor system;
      in {
        default = pkgs.mkShell {
          packages = [pkgs.bun pkgs.nodejs pkgs.ffmpeg pkgs.alejandra] ++ gitHooks.enabledPackages;
          inherit (gitHooks) shellHook;
        };
      });

      packages = forAllSystems (system: let
        pkgs = pkgsFor system;

        # Production dependencies only, unpacked at their install paths from
        # the tarballs listed by `scripts/nix_deps.ts`.
        nodeModules = pkgs.runCommand "autoscan-node-modules" {} (
          pkgs.lib.concatMapStrings (dep: ''
            mkdir -p "$out/${dep.path}"
            tar -xzf ${pkgs.fetchurl {inherit (dep) url hash;}} -C "$out/${dep.path}" --strip-components=1
          '') (builtins.fromJSON (builtins.readFile ./nix/deps.json))
        );

        # `bun build --compile` bundles `src/index.ts` into a standalone
        # binary; only the migrations folder is still needed at
        # runtime, and `db.ts` resolves it relative to the cwd.
        autoscan = pkgs.stdenv.mkDerivation {
          pname = "autoscan";
          version = "unstable";

          src = pkgs.lib.cleanSource ./.;

          nativeBuildInputs = [pkgs.bun pkgs.makeWrapper];

          buildPhase = ''
            runHook preBuild
            ln -s ${nodeModules}/node_modules node_modules
            bun build --compile --minify src/index.ts --outfile autoscan
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            install -Dm755 autoscan "$out/bin/autoscan"
            mkdir -p "$out/share/autoscan"
            cp -r ./migrations "$out/share/autoscan/migrations"

            wrapProgram "$out/bin/autoscan" \
              --prefix PATH : ${pkgs.lib.makeBinPath [pkgs.ffmpeg]} \
              --chdir "$out/share/autoscan"
            runHook postInstall
          '';

          # Stripping drops the bundle Bun appends to the compiled executable.
          dontStrip = true;

          # The NixOS module's ExecStart relies on this.
          meta.mainProgram = "autoscan";
        };
      in {
        default = autoscan;
        autoscan = autoscan;
      });
    }
    // {
      nixosModules.default = {
        config,
        lib,
        pkgs,
        ...
      }: let
        cfg = config.services.autoscan;
      in {
        options.services.autoscan = {
          enable = lib.mkEnableOption "autoscan media automation service";
          package = lib.mkOption {
            type = lib.types.package;
            default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
            description = "The autoscan package to use.";
          };
          dataDir = lib.mkOption {
            type = lib.types.path;
            default = "/var/lib/autoscan";
            description = "Directory for autoscan data files.";
          };
          port = lib.mkOption {
            type = lib.types.port;
            default = 3030;
            description = "Port for autoscan to listen on.";
          };

          user = lib.mkOption {
            type = lib.types.str;
            default = "autoscan";
            description = "User account under which Autoscan runs";
          };
          group = lib.mkOption {
            type = lib.types.str;
            default = "autoscan";
            description = "Group under which Autoscan runs";
          };

          settings = {
            plexUrl = lib.mkOption {
              type = lib.types.str;
              description = "URL of the Plex server";
            };
            domain = lib.mkOption {
              type = lib.types.str;
              description = "Public domain name";
            };
            tmdbApiUrl = lib.mkOption {
              type = lib.types.str;
              default = "https://api.themoviedb.org/3";
            };
            sonarrApiUrl = lib.mkOption {type = lib.types.str;};
            radarrApiUrl = lib.mkOption {type = lib.types.str;};
            bazarrApiUrl = lib.mkOption {type = lib.types.str;};
            bazarrFrenchProfile = lib.mkOption {
              type = lib.types.str;
              description = "Bazarr profile name requesting French forced subtitles only.";
            };
            transcodePath = lib.mkOption {
              type = lib.types.path;
              description = "Directory for temporary transcode files.";
            };
            postgres = {
              host = lib.mkOption {
                type = lib.types.str;
                description = "PostgreSQL host (or unix socket directory).";
              };
              port = lib.mkOption {
                type = lib.types.port;
                default = 5432;
                description = "PostgreSQL port.";
              };
              user = lib.mkOption {
                type = lib.types.str;
                description = "PostgreSQL role name.";
              };
              database = lib.mkOption {
                type = lib.types.str;
                description = "PostgreSQL database name.";
              };
            };
          };

          secrets = {
            telegramChatIdFile = lib.mkOption {type = lib.types.path;};
            telegramTokenFile = lib.mkOption {type = lib.types.path;};
            tmdbApiTokenFile = lib.mkOption {type = lib.types.path;};
            sonarrApiKeyFile = lib.mkOption {type = lib.types.path;};
            radarrApiKeyFile = lib.mkOption {type = lib.types.path;};
            bazarrApiKeyFile = lib.mkOption {type = lib.types.path;};
            postgresPasswordFile = lib.mkOption {
              type = lib.types.nullOr lib.types.path;
              default = null;
            };
          };
        };

        config = lib.mkIf cfg.enable {
          users.users = lib.mkIf (cfg.user == "autoscan") {
            autoscan = {
              group = cfg.group;
              home = cfg.dataDir;
              isSystemUser = true;
            };
          };

          users.groups = lib.mkIf (cfg.group == "autoscan") {
            autoscan = {};
          };

          systemd.services.autoscan = {
            description = "Autoscan media automation service";
            after = ["network.target"];
            wantedBy = ["multi-user.target"];

            serviceConfig = {
              ExecStart = "${cfg.package}/bin/autoscan";

              StateDirectory = "autoscan";
              WorkingDirectory = cfg.dataDir;
              UMask = "002";

              User = cfg.user;
              Group = cfg.group;
              Restart = "on-failure";

              CapabilityBoundingSet = "";
              NoNewPrivileges = true;
              PrivateDevices = true;
              ProtectHome = true;
            };

            environment =
              {
                PORT = toString cfg.port;
                PLEX_URL = cfg.settings.plexUrl;
                DOMAIN = cfg.settings.domain;
                TMDB_API_URL = cfg.settings.tmdbApiUrl;
                SONARR_API_URL = cfg.settings.sonarrApiUrl;
                RADARR_API_URL = cfg.settings.radarrApiUrl;
                BAZARR_API_URL = cfg.settings.bazarrApiUrl;
                BAZARR_FRENCH_PROFILE = cfg.settings.bazarrFrenchProfile;
                NODE_ENV = "production";

                TELEGRAM_CHAT_ID_FILE = toString cfg.secrets.telegramChatIdFile;
                TELEGRAM_TOKEN_FILE = toString cfg.secrets.telegramTokenFile;
                TMDB_API_TOKEN_FILE = toString cfg.secrets.tmdbApiTokenFile;
                SONARR_API_KEY_FILE = toString cfg.secrets.sonarrApiKeyFile;
                RADARR_API_KEY_FILE = toString cfg.secrets.radarrApiKeyFile;
                BAZARR_API_KEY_FILE = toString cfg.secrets.bazarrApiKeyFile;
                POSTGRES_PASSWORD_FILE = toString cfg.secrets.postgresPasswordFile;

                POSTGRES_HOST = cfg.settings.postgres.host;
                POSTGRES_PORT = toString cfg.settings.postgres.port;
                POSTGRES_DATABASE = cfg.settings.postgres.database;
                POSTGRES_USERNAME = cfg.settings.postgres.user;
                TRANSCODE_PATH = cfg.settings.transcodePath;
              }
              // lib.optionalAttrs (cfg.secrets.postgresPasswordFile != null) {
                POSTGRES_PASSWORD_FILE = toString cfg.secrets.postgresPasswordFile;
              };
          };
        };
      };
    };
}
