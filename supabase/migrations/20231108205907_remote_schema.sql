set check_function_bodies = off;

CREATE OR REPLACE FUNCTION get_current_timestamp()
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN jsonb_build_object(
    'current_timestamp', (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::BIGINT
  );
END; $$


