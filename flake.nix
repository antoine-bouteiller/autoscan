{
  description = "Autoscan - Media automation service";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = {
    self,
    nixpkgs,
  }: let
    supportedSystems = ["x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin"];
    forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
  in
    {
      packages = forAllSystems (system: let
        pkgs = nixpkgs.legacyPackages.${system};

        autoscan = pkgs.stdenvNoCC.mkDerivation {
          pname = "autoscan";
          version = "unstable";

          src = pkgs.lib.cleanSource ./.;

          nativeBuildInputs = [
            pkgs.nodejs
            pkgs.pnpm_10
            pkgs.pnpmConfigHook
            pkgs.makeWrapper
          ];

          pnpmDeps = pkgs.fetchPnpmDeps {
            pname = "autoscan";
            version = "unstable";
            src = pkgs.lib.cleanSource ./.;
            hash = "sha256-cgVJniDKDkVKtpBLJPnLLs5ZYg+yG+l0QxIvK1VTqCw=";
            fetcherVersion = 3;
          };

          buildPhase = ''
            runHook preBuild
            pnpm run pack
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p $out/lib/autoscan $out/bin

            cp dist/index.mjs $out/lib/autoscan/
            cp -r migrations $out/lib/autoscan/
            cp -r node_modules $out/lib/autoscan/

            makeWrapper ${pkgs.nodejs}/bin/node $out/bin/autoscan \
              --add-flags "$out/lib/autoscan/index.mjs" \
              --run "cd $out/lib/autoscan"
            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "Media automation service integrating Radarr, Sonarr, Plex, and TMDB";
            homepage = "https://github.com/antoine-bouteiller/autoscan";
            license = licenses.mit;
            platforms = platforms.all;
            mainProgram = "autoscan";
          };
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
            plexTokenFile = lib.mkOption {type = lib.types.path;};
            telegramTokenFile = lib.mkOption {type = lib.types.path;};
            cloudflareTokenFile = lib.mkOption {type = lib.types.path;};
            tmdbApiTokenFile = lib.mkOption {type = lib.types.path;};
            sonarrApiKeyFile = lib.mkOption {type = lib.types.path;};
            radarrApiKeyFile = lib.mkOption {type = lib.types.path;};
            traktClientIdFile = lib.mkOption {type = lib.types.path;};
            traktClientSecretFile = lib.mkOption {type = lib.types.path;};
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
                PLEX_TOKEN_FILE = toString cfg.secrets.plexTokenFile;
                TELEGRAM_TOKEN_FILE = toString cfg.secrets.telegramTokenFile;
                CLOUDFLARE_TOKEN_FILE = toString cfg.secrets.cloudflareTokenFile;
                TMDB_API_TOKEN_FILE = toString cfg.secrets.tmdbApiTokenFile;
                SONARR_API_KEY_FILE = toString cfg.secrets.sonarrApiKeyFile;
                RADARR_API_KEY_FILE = toString cfg.secrets.radarrApiKeyFile;
                TRAKT_CLIENT_ID_FILE = toString cfg.secrets.traktClientIdFile;
                POSTGRES_PASSWORD_FILE = toString cfg.secrets.postgresPasswordFile;
                TRAKT_CLIENT_SECRET_FILE = toString cfg.secrets.traktClientSecretFile;

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
