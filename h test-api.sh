[4msudo_root[24m(8)                                           System Manager's Manual                                           [4msudo_root[24m(8)

[1mNAME[0m
       sudo_root - How to run administrative commands

[1mSYNOPSIS[0m
       [1msudo [4m[22mcommand[0m

       [1msudo -i[0m

[1mINTRODUCTION[0m
       By  default, the password for the user "root" (the system administrator) is locked. This means you cannot login as root or use
       su. Instead, the installer will set up sudo to allow the user that is created during install to run  all  administrative  com‐
       mands.

       This  means that in the terminal you can use sudo for commands that require root privileges. All programs in the menu will use
       a graphical sudo to prompt for a password. When sudo asks for a password, it needs [1myour password, [22mthis means that a root pass‐
       word is not needed.

       To run a command which requires root privileges in a terminal, simply prepend [1msudo [22min front of it. To get an interactive  root
       shell, use [1msudo -i[22m.

[1mALLOWING OTHER USERS TO RUN SUDO[0m
       By  default,  only the user who installed the system is permitted to run sudo. To add more administrators, i. e. users who can
       run sudo, you have to add these users to the group 'sudo' by doing one of the following steps:

       * In a shell, do

           [1msudo adduser [4m[22musername[24m [1msudo[0m

       * Use the graphical "Users & Groups" program in the "System settings" menu to add the new user to the [1msudo [22mgroup.

[1mBENEFITS OF USING SUDO[0m
       The benefits of leaving root disabled by default include the following:

       * Users do not have to remember an extra password, which they are likely to forget.

       * The installer is able to ask fewer questions.

       * It avoids the "I can do anything" interactive login by default - you will be prompted for a password  before  major  changes
         can happen, which should make you think about the consequences of what you are doing.

       * Sudo adds a log entry of the command(s) run (in [1m/var/log/auth.log[22m).

       * Every attacker trying to brute-force their way into your box will know it has an account named root and will try that first.
         What they do not know is what the usernames of your other users are.

       * Allows  easy  transfer  for  admin  rights,  in a short term or long term period, by adding and removing users from the sudo
         group, while not compromising the root account.

       * sudo can be set up with a much more fine-grained security policy.

       * On systems with more than one administrator using sudo avoids sharing a password amongst them.

[1mDOWNSIDES OF USING SUDO[0m
       Although for desktops the benefits of using sudo are great, there are possible issues which need to be noted:

       * Redirecting the output of commands run with sudo can be confusing at first. For instance consider

           [1msudo ls > /root/somefile[0m

         will not work since it is the shell that tries to write to that file. You can use

           [1mls | sudo tee /root/somefile[0m

         to get the behaviour you want.

       * In a lot of office environments the ONLY local user on a system is root. All other users are imported using  NSS  techniques
         such  as nss-ldap. To setup a workstation, or fix it, in the case of a network failure where nss-ldap is broken, root is re‐
         quired. This tends to leave the system unusable. An extra local user, or an enabled root password is needed here.

[1mGOING BACK TO A TRADITIONAL ROOT ACCOUNT[0m
       [1mThis is not recommended![0m

       To enable the root account (i.e. set a password) use:

           [1msudo passwd root[0m

       Afterwards, edit the sudo configuration with [1msudo visudo [22mand comment out the line

           %sudo  ALL=(ALL) ALL

       to disable sudo access to members of the sudo group.

[1mSEE ALSO[0m
       [1msudo[22m(8), [1mhttps://wiki.ubuntu.com/RootSudo[0m

                                                           February 8, 2006                                              [4msudo_root[24m(8)
