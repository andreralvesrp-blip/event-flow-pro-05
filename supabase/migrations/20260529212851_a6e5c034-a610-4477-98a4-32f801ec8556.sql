ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS widget_delay      int;
ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS widget_avatar_url text;
ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS widget_msg_1      varchar(60);
ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS widget_msg_2      varchar(60);
ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS widget_msg_3      varchar(60);