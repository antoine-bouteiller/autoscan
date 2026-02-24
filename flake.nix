{
  description = "Autoscan - Media automation service";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }: let
    version = "1.1.2";
    x86_64-linux-hash = "sha256-VuGCqZo4R2gsLRwNB/2zUZJf7ySSUby3G+DEpQcEUgc=";
    supportedSystems = ["x86_64-linux"];
  in
    (flake-utils.lib.eachSystem supportedSystems (
      system: let
        pkgs = nixpkgs.legacyPackages.${system};

        autoscan = pkgs.stdenv.mkDerivation {
          pname = "autoscan";
          inherit version;

          src = pkgs.fetchurl {
            url = "https://github.com/antoine-bouteiller/autoscan/releases/download/v${version}/autoscan-linux-x64";
            hash = x86_64-linux-hash;
          };

          dontUnpack = true;

          nativeBuildInputs = [
            pkgs.autoPatchelfHook
            pkgs.makeWrapper
          ];

          buildInputs = [
            pkgs.stdenv.cc.cc.lib
          ];

          installPhase = ''
            install -Dm755 $src $out/bin/autoscan
            wrapProgram $out/bin/autoscan \
              --prefix PATH : ${pkgs.lib.makeBinPath [pkgs.ffmpeg]}
          '';

          meta = with pkgs.lib; {
            description = "Media automation service integrating Radarr, Sonarr, Plex, and TMDB";
            homepage = "https://github.com/antoine-bouteiller/autoscan";
            license = licenses.mit;
            platforms = platforms.linux;
            mainProgram = "autoscan";
          };
        };
      in {
        packages.default = autoscan;
        packages.autoscan = autoscan;
      }
    ))
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
          environmentFile = lib.mkOption {
            type = lib.types.nullOr lib.types.path;
            default = null;
            description = "Path to environment file containing secrets.";
          };
          port = lib.mkOption {
            type = lib.types.port;
            default = 3030;
            description = "Port for autoscan to listen on.";
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
          };

          secrets = {
            telegramChatIdFile = lib.mkOption {type = lib.types.path;};
            plexTokenFile = lib.mkOption {type = lib.types.path;};
            telegramTokenFile = lib.mkOption {type = lib.types.path;};
            cloudflareTokenFile = lib.mkOption {type = lib.types.path;};
            tmdbApiTokenFile = lib.mkOption {type = lib.types.path;};
            sonarrApiKeyFile = lib.mkOption {type = lib.types.path;};
            radarrApiKeyFile = lib.mkOption {type = lib.types.path;};
          };
        };

        config = lib.mkIf cfg.enable {
          users.users.autoscan = {
            isSystemUser = true;
            group = "autoscan";
            home = cfg.dataDir;
          };

          users.groups.autoscan = {};

          systemd.services.autoscan = {
            description = "Autoscan media automation service";
            after = ["network.target"];
            wantedBy = ["multi-user.target"];

            serviceConfig = {
              ExecStart = "${cfg.package}/bin/autoscan";

              StateDirectory = "autoscan";
              WorkingDirectory = cfg.dataDir;

              User = "autoscan";
              Group = "autoscan";
              Restart = "on-failure";

              CapabilityBoundingSet = "";
              NoNewPrivileges = true;
              PrivateDevices = true;
              ProtectHome = true;
              ProtectSystem = "strict";
              ReadWritePaths = [cfg.dataDir];
            };

            environment = {
              PORT = toString cfg.port;
              PLEX_URL = cfg.settings.plexUrl;
              DOMAIN = cfg.settings.domain;
              TMDB_API_URL = cfg.settings.tmdbApiUrl;
              SONARR_API_URL = cfg.settings.sonarrApiUrl;
              RADARR_API_URL = cfg.settings.radarrApiUrl;
              TELEGRAM_CHAT_ID_FILE = toString cfg.secrets.telegramChatIdFile;
              PLEX_TOKEN_FILE = toString cfg.secrets.plexTokenFile;
              TELEGRAM_TOKEN_FILE = toString cfg.secrets.telegramTokenFile;
              CLOUDFLARE_TOKEN_FILE = toString cfg.secrets.cloudflareTokenFile;
              TMDB_API_TOKEN_FILE = toString cfg.secrets.tmdbApiTokenFile;
              SONARR_API_KEY_FILE = toString cfg.secrets.sonarrApiKeyFile;
              RADARR_API_KEY_FILE = toString cfg.secrets.radarrApiKeyFile;
              DATABASE_URL = "${cfg.dataDir}/autoscan.db";
            };
          };
        };
      };
    };
}
