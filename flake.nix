{
  description = "Autoscan - Media automation service";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    bun2nix = {
      url = "github:nix-community/bun2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = {
    self,
    nixpkgs,
    bun2nix,
  }: let
    supportedSystems = ["x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin"];
    forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
  in
    {
      packages = forAllSystems (system: let
        pkgs = nixpkgs.legacyPackages.${system};

        # The bun2nix binary carries its `mkDerivation` / `fetchBunDeps`
        # helpers in its passthru.
        inherit (bun2nix.packages.${system}.default) mkDerivation fetchBunDeps;

        # `bun build --compile` bundles `src/index.ts` into a standalone
        # binary; only the drizzle migrations folder is still needed at
        # runtime, and `db.ts` resolves it relative to the cwd.
        autoscan = mkDerivation {
          pname = "autoscan";
          version = "unstable";

          src = pkgs.lib.cleanSource ./.;

          module = "src/index.ts";
          # `bun build --bytecode` fails on this bundle (CommonJS-only feature).
          bunCompileToBytecode = false;
          removeBunBuildFlags = ["--sourcemap"];
          dontUseBunCheck = true;
          # Lifecycle scripts (lefthook git hooks, our bun2nix postinstall) are
          # irrelevant inside the sandbox and would fail without a git repo.
          dontRunLifecycleScripts = true;

          nativeBuildInputs = [pkgs.makeWrapper];

          postInstall = ''
            mkdir -p "$out/share/autoscan"
            cp -r ./migrations "$out/share/autoscan/migrations"

            wrapProgram "$out/bin/autoscan" \
              --prefix PATH : ${pkgs.lib.makeBinPath [pkgs.ffmpeg]} \
              --chdir "$out/share/autoscan"
          '';

          bunDeps = fetchBunDeps {
            bunNix = ./bun.nix;
          };
          # `bun2nix.mkDerivation` already sets `meta.mainProgram = pname`
          # ("autoscan"), which is what the NixOS module's ExecStart relies on.
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

            path = [pkgs.ffmpeg];

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
                NODE_ENV = "production";

                TELEGRAM_CHAT_ID_FILE = toString cfg.secrets.telegramChatIdFile;
                TELEGRAM_TOKEN_FILE = toString cfg.secrets.telegramTokenFile;
                TMDB_API_TOKEN_FILE = toString cfg.secrets.tmdbApiTokenFile;
                SONARR_API_KEY_FILE = toString cfg.secrets.sonarrApiKeyFile;
                RADARR_API_KEY_FILE = toString cfg.secrets.radarrApiKeyFile;
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
