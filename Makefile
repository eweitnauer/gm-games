install:
	rsync -r -a -v -e "ssh" --delete ./missile-command/ graspablemath.com:/srv/www/graspablemath.com/public_html/missile-command

.PHONY: install
