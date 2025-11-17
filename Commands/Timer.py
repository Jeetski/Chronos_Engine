from Modules.Timer import main as Timer


def run(args, properties):
    """
    timer start <profile> [type:<item_type> name:<item_name>] [cycles:N] [auto_advance:true|false]
    timer pause | resume | stop | status
    timer profiles list | view <name> | save <name> [k:v ...] | delete <name>
    """
    if not args or args[0].lower() in {'-h', '--help', 'help'}:
        print(get_help_message())
        return

    sub = args[0].lower()
    if sub == 'start':
        if len(args) < 2:
            print(get_help_message())
            return
        profile = args[1]
        bind_type = properties.get('type')
        bind_name = properties.get('name')
        cycles = None
        if 'cycles' in properties:
            try:
                cycles = int(properties.get('cycles'))
            except Exception:
                cycles = None
        auto_adv = properties.get('auto_advance')
        if isinstance(auto_adv, str):
            auto_adv = auto_adv.lower() == 'true'
        elif auto_adv is None:
            auto_adv = True
        try:
            st = Timer.start_timer(profile, bind_type=bind_type, bind_name=bind_name, cycles=cycles, auto_advance=auto_adv)
            print(f"Started timer: profile={profile}, phase=focus, remaining={st.get('remaining_seconds')}s")
        except Exception as e:
            print(f"Error: {e}")
        return

    if sub == 'pause':
        st = Timer.pause_timer()
        print(f"Timer status: {st.get('status')}")
        return

    if sub == 'resume':
        st = Timer.resume_timer()
        print(f"Timer status: {st.get('status')}")
        return

    if sub == 'stop':
        st = Timer.stop_timer()
        print("Timer stopped.")
        return

    if sub == 'status':
        st = Timer.status()
        if st.get('status') == 'idle':
            print("Timer: idle")
            return
        print(f"Timer: {st.get('status')} | profile={st.get('profile_name')} | phase={st.get('current_phase')} | remaining={st.get('remaining_seconds')}s | cycle={st.get('cycle_index')}")
        return

    if sub == 'profiles':
        if len(args) < 2:
            print(get_help_message())
            return
        action = args[1].lower()
        if action == 'list':
            names = Timer.profiles_list()
            if names:
                print("Profiles:")
                for n in names:
                    print(f"  - {n}")
            else:
                print("No profiles.")
            return
        if action == 'view' and len(args) >= 3:
            name = args[2]
            cfg = Timer.profiles_view(name)
            if not cfg:
                print(f"Profile '{name}' not found.")
            else:
                print(cfg)
            return
        if action == 'save' and len(args) >= 3:
            name = args[2]
            # properties includes key:value pairs
            cfg = {}
            for k, v in properties.items():
                # cast ints when possible
                if isinstance(v, str) and v.isdigit():
                    cfg[k] = int(v)
                else:
                    cfg[k] = v
            Timer.profiles_save(name, cfg)
            print(f"Saved profile '{name}'.")
            return
        if action == 'delete' and len(args) >= 3:
            name = args[2]
            Timer.profiles_delete(name)
            print(f"Deleted profile '{name}'.")
            return
        print(get_help_message())
        return

    print(get_help_message())


def get_help_message():
    return """
Usage:
  timer start <profile> [type:<item_type> name:<item_name>] [cycles:N] [auto_advance:true|false]
  timer pause | resume | stop | status
  timer profiles list | view <name> | save <name> [k:v ...] | delete <name>
"""

